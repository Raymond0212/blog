import { logger } from "@/features/hidock/utils/logger"
import type { DeviceService } from "@/features/hidock/services/device-service"
import {
  getCapabilities,
  type JensenCapabilities,
} from "@/features/hidock/jensen/capability-policy"
import { JensenCommandScheduler } from "@/features/hidock/jensen/command-scheduler"
import {
  JENSEN_USB_ALTERNATE,
  JENSEN_USB_CONFIGURATION,
  JENSEN_USB_IN_ENDPOINT,
  JENSEN_USB_INTERFACE,
  JENSEN_USB_OUT_ENDPOINT,
  JENSEN_USB_READ_SIZE,
  JENSEN_VENDOR_IDS,
  JensenCommand,
} from "@/features/hidock/jensen/constants"
import {
  isSupportedJensenDevice,
  modelFromProductId,
} from "@/features/hidock/jensen/device-models"
import {
  JensenFrameDecoder,
  type JensenMessage,
} from "@/features/hidock/jensen/frame-codec"
import {
  estimateHiDockDurationSec,
  parseBcdDeviceTime,
  parseBluetoothDevices,
  parseBluetoothMac,
  parseBluetoothStatus,
  parseDeviceInfoBody,
  parseFileListPayload,
  parsePairedBluetoothDevices,
  parseRecordingStatus,
  parseRealtimeStatus,
  parseSettings,
} from "@/features/hidock/jensen/parsers"
import type {
  AudioInputDevice,
  BatteryStatus,
  BluetoothDeviceInfo,
  BluetoothStatus,
  CardInfo,
  DeleteResult,
  DeviceInfo,
  DeviceSettings,
  DownloadOptions,
  DownloadFileResult,
  DownloadProgress,
  DownloadReport,
  GenericResult,
  HiDockFile,
  RealtimeStatus,
  RecordingQuality,
  RecordingStatus,
  DeviceConnectionState,
} from "@/features/hidock/types/device"

function toHex(v?: number): string | undefined {
  return v == null ? undefined : `0x${v.toString(16)}`
}

function readUint32BE(bytes: Uint8Array, offset = 0): number {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  )
}

function writeUint32BE(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function genericResult(msg: JensenMessage | null): GenericResult {
  if (!msg) return { result: "failed", error: "No response" }
  const code = msg.body[0] ?? 1
  return { result: code === 0 ? "success" : "failed", code }
}

function toBcd(v: number): number {
  return ((Math.floor(v / 10) << 4) | (v % 10)) & 0xff
}

export { estimateHiDockDurationSec }

export class WebUsbDeviceService implements DeviceService {
  private device: USBDevice | null = null
  private readonly decoder = new JensenFrameDecoder()
  private readonly scheduler: JensenCommandScheduler
  private readLoopRunning = false
  private readLoopGeneration = 0
  private cachedDeviceInfo: DeviceInfo | null = null
  private connectionState: DeviceConnectionState = "idle"
  private readonly stateListeners = new Set<
    (state: DeviceConnectionState) => void
  >()
  private liveMode = false
  private listingFiles = false
  private manualDisconnect = false
  private disposed = false
  private consecutiveReadFailures = 0
  private lastProductId: number | null = null
  private readonly handleUsbDisconnect = (event: USBConnectionEvent) => {
    if (event.device === this.device) {
      void this.handleTransportFailure(new Error("HiDock device was unplugged"))
    }
  }
  private readonly handleUsbConnect = (event: USBConnectionEvent) => {
    if (
      this.connectionState === "disconnected" &&
      !this.manualDisconnect &&
      event.device.productId === this.lastProductId &&
      isSupportedJensenDevice(event.device)
    ) {
      void this.reconnect(event.device)
    }
  }

  constructor() {
    this.scheduler = new JensenCommandScheduler(async (frame) => {
      const device = this.device
      if (!device) throw new Error("Device not connected")
      const result = await device.transferOut(JENSEN_USB_OUT_ENDPOINT, frame)
      if (result.status !== "ok")
        throw new Error(`USB write failed: ${result.status}`)
    }, Date.now() >>> 0)
    this.installUsbListeners()
  }

  getCapability() {
    const hasUsb = typeof navigator !== "undefined" && Boolean(navigator.usb)
    const hasPicker =
      typeof window !== "undefined" &&
      typeof window.showDirectoryPicker === "function"
    return {
      canUsbOperate: hasUsb,
      canPickFolder: hasPicker,
      runtime: "browser" as const,
      transport: hasUsb ? ("webusb" as const) : ("ui-only" as const),
      reason: hasUsb
        ? undefined
        : "WebUSB is unavailable. Use Chrome/Edge desktop with secure context (https or localhost).",
    }
  }

  subscribeConnectionState(
    listener: (state: DeviceConnectionState) => void,
  ): () => void {
    this.stateListeners.add(listener)
    listener(this.connectionState)
    return () => this.stateListeners.delete(listener)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const usb = typeof navigator !== "undefined" ? navigator.usb : undefined
    usb?.removeEventListener("disconnect", this.handleUsbDisconnect)
    usb?.removeEventListener("connect", this.handleUsbConnect)
    this.scheduler.stop(new Error("HiDock service disposed"))
    this.stateListeners.clear()
    void this.clearTransport(new Error("HiDock service disposed"), true)
  }

  private installUsbListeners(): void {
    const usb = typeof navigator !== "undefined" ? navigator.usb : undefined
    usb?.addEventListener("disconnect", this.handleUsbDisconnect)
    usb?.addEventListener("connect", this.handleUsbConnect)
  }

  private setConnectionState(state: DeviceConnectionState): void {
    if (state === this.connectionState) return
    this.connectionState = state
    for (const listener of this.stateListeners) listener(state)
  }

  private startReadLoop(): void {
    if (this.readLoopRunning || !this.device) return
    this.readLoopRunning = true
    const generation = ++this.readLoopGeneration

    void (async () => {
      while (
        this.readLoopRunning &&
        generation === this.readLoopGeneration &&
        this.device
      ) {
        if (!this.scheduler.isBusy) {
          await new Promise((resolve) => setTimeout(resolve, 10))
          continue
        }
        try {
          const result = await this.device.transferIn(
            JENSEN_USB_IN_ENDPOINT,
            JENSEN_USB_READ_SIZE,
          )
          if (!result?.data || result.data.byteLength === 0) continue
          this.consecutiveReadFailures = 0
          const chunk = new Uint8Array(
            result.data.buffer,
            result.data.byteOffset,
            result.data.byteLength,
          )
          for (const message of this.decoder.push(chunk)) {
            logger.debug("webusb", "received Jensen frame", {
              command: message.command,
              sequence: message.sequence,
              payloadLength: message.body.length,
              paddingLength: message.paddingLength,
            })
            if (!this.scheduler.accept(message)) {
              logger.debug("webusb", "ignored unsolicited Jensen frame", {
                command: message.command,
                sequence: message.sequence,
              })
            }
          }
        } catch (error) {
          this.consecutiveReadFailures += 1
          if (this.consecutiveReadFailures >= 3) {
            await this.handleTransportFailure(
              error instanceof Error ? error : new Error(String(error)),
            )
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
      }
      if (generation === this.readLoopGeneration) this.readLoopRunning = false
    })()
  }

  private stopReadLoop(): void {
    this.readLoopRunning = false
    this.readLoopGeneration += 1
  }

  private async sendCommand(
    command: number,
    body = new Uint8Array(),
    timeoutSeconds = 8,
  ): Promise<JensenMessage | null> {
    logger.debug("webusb", "sendCommand", {
      command,
      bodyLength: body.length,
      timeoutSeconds,
    })
    if (!this.device || !this.device.opened)
      throw new Error("Device not connected")
    try {
      return await this.scheduler.send(command, body, {
        timeoutMs: timeoutSeconds * 1000,
      })
    } catch (error) {
      if ((error as Error).message.includes("timed out")) return null
      throw error
    }
  }

  async connect(): Promise<DeviceInfo> {
    logger.info("webusb", "connect requested")
    if (!navigator.usb)
      throw new Error("WebUSB is not supported in this browser")
    this.manualDisconnect = false
    this.setConnectionState("selecting")

    const known = await navigator.usb.getDevices()
    const existing = known.find((device) => isSupportedJensenDevice(device))

    let device: USBDevice
    try {
      device =
        existing ??
        (await navigator.usb.requestDevice({
          filters: JENSEN_VENDOR_IDS.map((vendorId) => ({ vendorId })),
        }))
    } catch (error) {
      this.setConnectionState("idle")
      const msg = (error as Error)?.message ?? String(error)
      const lower = msg.toLowerCase()
      if (
        lower.includes("no device selected") ||
        lower.includes("notfounderror")
      ) {
        throw new Error(
          "WebUSB device picker did not return a device. Open this app in Chrome/Edge directly and try again.",
        )
      }
      if (
        lower.includes("securityerror") ||
        lower.includes("notallowederror")
      ) {
        throw new Error(
          "WebUSB access was blocked by browser security/permission policy. Use Chrome/Edge desktop on localhost/HTTPS.",
        )
      }
      throw error
    }

    if (!isSupportedJensenDevice(device)) {
      this.setConnectionState("idle")
      throw new Error(
        "The selected USB device is not a supported HiDock Jensen device",
      )
    }
    return this.openDevice(device, "opening")
  }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    this.setConnectionState("disconnecting")
    await this.clearTransport(new Error("HiDock manually disconnected"), true)
    this.setConnectionState("idle")
  }

  private async openDevice(
    device: USBDevice,
    state: "opening" | "reconnecting",
  ): Promise<DeviceInfo> {
    this.setConnectionState(state)
    try {
      if (!device.opened) await device.open()
      if (
        device.configuration?.configurationValue !== JENSEN_USB_CONFIGURATION
      ) {
        await device.selectConfiguration(JENSEN_USB_CONFIGURATION)
      }
      await device.claimInterface(JENSEN_USB_INTERFACE)
      await device.selectAlternateInterface(
        JENSEN_USB_INTERFACE,
        JENSEN_USB_ALTERNATE,
      )
    } catch (error) {
      if (device.opened) {
        try {
          await device.close()
        } catch (closeError) {
          logger.error(
            "webusb",
            "failed to close partially opened device",
            closeError,
          )
        }
      }
      this.setConnectionState(state === "opening" ? "idle" : "disconnected")
      throw error
    }

    this.device = device
    this.lastProductId = device.productId
    this.cachedDeviceInfo = null
    this.decoder.reset()
    this.scheduler.resume()
    this.startReadLoop()

    try {
      const info = await this.readDeviceInfoRaw()
      this.cachedDeviceInfo = {
        ...info,
        vid: toHex(device.vendorId),
        pid: toHex(device.productId),
        serial: info.serial || device.serialNumber,
      }
      this.setConnectionState("connected")
    } catch (error) {
      logger.error("webusb", "device identification failed", error)
      this.cachedDeviceInfo = {
        connected: true,
        identified: false,
        model: modelFromProductId(device.productId),
        vid: toHex(device.vendorId),
        pid: toHex(device.productId),
        serial: device.serialNumber,
      }
      this.setConnectionState("connected-unidentified")
    }
    return this.cachedDeviceInfo
  }

  private async reconnect(device: USBDevice): Promise<void> {
    try {
      await this.openDevice(device, "reconnecting")
    } catch (error) {
      logger.error("webusb", "automatic reconnect failed", error)
      this.setConnectionState("disconnected")
    }
  }

  private async handleTransportFailure(error: Error): Promise<void> {
    if (!this.device && this.connectionState === "disconnected") return
    logger.error("webusb", "transport failure", error)
    this.setConnectionState("transport-error")
    await this.clearTransport(error, true)
    this.setConnectionState("disconnected")
  }

  private async clearTransport(
    reason: Error,
    closeDevice: boolean,
  ): Promise<void> {
    const device = this.device
    this.stopReadLoop()
    this.scheduler.cancelAll(reason)
    this.decoder.reset()
    this.liveMode = false
    this.listingFiles = false
    this.cachedDeviceInfo = null
    this.device = null
    this.consecutiveReadFailures = 0
    if (closeDevice && device?.opened) {
      try {
        await device.close()
      } catch (error) {
        logger.error("webusb", "failed to close device", error)
      }
    }
  }

  private capabilities(): JensenCapabilities {
    return getCapabilities(
      {
        model: this.cachedDeviceInfo?.model,
        versionNumber: this.cachedDeviceInfo?.versionNumber,
      },
      {
        busy: this.scheduler.isBusy,
        liveMode: this.liveMode,
        listingFiles: this.listingFiles,
      },
    )
  }

  private assertCapability(feature: keyof JensenCapabilities): void {
    const capability = this.capabilities()[feature]
    if (!capability.allowed)
      throw new Error(capability.reason ?? `${feature} is unavailable`)
  }

  private usesLegacySettingsFallback(): boolean {
    const model = this.cachedDeviceInfo?.model
    return (
      (model === "hidock-h1" || model === "hidock-h1e") &&
      (this.cachedDeviceInfo?.versionNumber ?? 0) < 327714
    )
  }

  private async readDeviceInfoRaw(): Promise<DeviceInfo> {
    const response = await this.sendCommand(
      JensenCommand.GetDeviceInfo,
      new Uint8Array(),
      5,
    )
    if (!response) throw new Error("Failed to get device info")
    const model = modelFromProductId(this.device?.productId)
    if (!model)
      throw new Error(
        "HiDock model could not be identified from its product ID",
      )
    return parseDeviceInfoBody(response.body, model)
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    if (this.cachedDeviceInfo) return this.cachedDeviceInfo
    const fresh = await this.readDeviceInfoRaw()
    this.cachedDeviceInfo = fresh
    return fresh
  }

  async getFileCount(): Promise<number> {
    this.assertCapability("fileList")
    const msg = await this.sendCommand(
      JensenCommand.GetFileCount,
      new Uint8Array(),
      5,
    )
    if (!msg || msg.body.length < 4) return 0
    return readUint32BE(msg.body)
  }

  async listFiles(
    onPartial?: (files: HiDockFile[]) => void,
  ): Promise<HiDockFile[]> {
    this.assertCapability("fileList")
    const useCountCommand =
      this.cachedDeviceInfo?.versionNumber == null ||
      this.cachedDeviceInfo.versionNumber <= 327722
    const countHint = useCountCommand
      ? await this.getFileCount().catch(() => 0)
      : null
    let aggregate = new Uint8Array()
    let lastEmitted = 0
    this.listingFiles = true

    try {
      return await this.scheduler.send<HiDockFile[]>(
        JensenCommand.GetFileList,
        new Uint8Array(),
        {
          timeoutMs: 5000,
          streamIdleTimeoutMs: 3000,
          acceptCommandStream: true,
          responsePolicy: (message) => {
            const merged = new Uint8Array(
              aggregate.length + message.body.length,
            )
            merged.set(aggregate)
            merged.set(message.body, aggregate.length)
            aggregate = merged
            const parsed = parseFileListPayload(aggregate)
            if (onPartial && parsed.files.length > lastEmitted) {
              lastEmitted = parsed.files.length
              onPartial(parsed.files)
            }
            const complete =
              parsed.complete ||
              (countHint != null &&
                countHint > 0 &&
                parsed.files.length >= countHint) ||
              (message.body.length === 0 && countHint === 0)
            return complete
              ? { done: true, value: parsed.files }
              : { done: false }
          },
        },
      )
    } catch (error) {
      const parsed = parseFileListPayload(aggregate)
      if (parsed.files.length === 0 && countHint === 0) return []
      logger.error("webusb", "file-list stream failed", error)
      throw new Error(
        `Timed out while listing files from device${
          parsed.files.length > 0
            ? ` (${parsed.files.length} records received)`
            : ""
        }`,
      )
    } finally {
      this.listingFiles = false
    }
  }

  async downloadFiles(
    files: HiDockFile[],
    _destination: string,
    onProgress: (progress: DownloadProgress) => void,
    _options?: DownloadOptions,
  ): Promise<DownloadReport> {
    this.assertCapability("fileList")
    void _destination
    void _options
    const aggregateTotal = files.reduce((s, f) => s + f.fileLength, 0)
    let aggregateDone = 0
    const results: DownloadFileResult[] = []

    for (const file of files) {
      let offset = 0
      let status: DownloadFileResult["status"] = "success"
      let err: string | undefined
      let failureReason:
        | "none"
        | "empty_response"
        | "timeout"
        | "disconnected"
        | "short_read"
        | "exception" = "none"
      const chunks: ArrayBuffer[] = []

      try {
        const startBody = new TextEncoder().encode(file.filename)
        await this.scheduler.send<number>(
          JensenCommand.TransferFile,
          startBody,
          {
            timeoutMs: 12000,
            streamIdleTimeoutMs: 2500,
            acceptCommandStream: true,
            responsePolicy: (message) => {
              if (message.body.length > 0) {
                const remaining = Math.max(0, file.fileLength - offset)
                const chunk = message.body.slice(0, remaining)
                chunks.push(
                  chunk.buffer.slice(
                    chunk.byteOffset,
                    chunk.byteOffset + chunk.byteLength,
                  ) as ArrayBuffer,
                )
                offset += chunk.length
                aggregateDone += chunk.length
                onProgress({
                  filename: file.filename,
                  done: offset,
                  total: file.fileLength,
                  aggregateDone,
                  aggregateTotal,
                })
              }
              return offset >= file.fileLength
                ? { done: true, value: offset }
                : { done: false }
            },
          },
        )

        if (offset > 0 || file.fileLength === 0) {
          const blob = new Blob(chunks, { type: "application/octet-stream" })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement("a")
          anchor.href = url
          anchor.download = file.filename
          anchor.style.display = "none"
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          if (offset < file.fileLength) {
            status = "failed"
            err = `Short read: expected ${file.fileLength} bytes, got ${offset}`
            failureReason =
              failureReason === "none" ? "short_read" : failureReason
          }
        } else {
          status = "failed"
          err = "No data returned from device"
          failureReason =
            failureReason === "none" ? "empty_response" : failureReason
        }
      } catch (e) {
        status = "failed"
        err = (e as Error).message
        const lower = (err ?? "").toLowerCase()
        if (lower.includes("timed out")) failureReason = "timeout"
        else if (
          lower.includes("disconnect") ||
          lower.includes("not connected") ||
          lower.includes("device")
        )
          failureReason = "disconnected"
        else failureReason = "exception"
      }

      logger.info("webusb", "download file done", {
        filename: file.filename,
        status,
        expectedBytes: file.fileLength,
        bytesReceived: offset,
        failureReason,
        error: err,
      })
      results.push({
        filename: file.filename,
        status,
        bytesWritten: offset,
        error: err,
        outputPath: file.filename,
      })
    }

    return {
      files: results,
      totalBytesWritten: results.reduce((s, r) => s + r.bytesWritten, 0),
    }
  }

  async deleteFile(filename: string): Promise<DeleteResult> {
    this.assertCapability("fileList")
    const msg = await this.sendCommand(
      JensenCommand.DeleteFile,
      new TextEncoder().encode(filename),
      8,
    )
    if (!msg || msg.command !== JensenCommand.DeleteFile)
      return { result: "failed", code: -1 }
    const code = msg.body[0] ?? 2
    const map: Record<number, DeleteResult["result"]> = {
      0: "success",
      1: "not-exists",
      2: "failed",
    }
    return { result: map[code] ?? "unknown_error", code }
  }

  async getCardInfo(): Promise<CardInfo> {
    this.assertCapability("cardInfo")
    const msg = await this.sendCommand(
      JensenCommand.GetCardInfo,
      new Uint8Array(),
      5,
    )
    if (!msg || msg.body.length < 12) throw new Error("Failed to get card info")
    const free = readUint32BE(msg.body, 0)
    const capacity = readUint32BE(msg.body, 4)
    const statusRaw = readUint32BE(msg.body, 8)
    return {
      free,
      used: Math.max(0, capacity - free),
      capacity,
      statusRaw,
      status: statusRaw.toString(16),
    }
  }

  async formatCard(confirmed: boolean): Promise<GenericResult> {
    if (!confirmed)
      return {
        result: "failed",
        error: "format requires explicit confirmation",
      }
    this.assertCapability("cardInfo")
    const msg = await this.sendCommand(
      JensenCommand.FormatCard,
      new Uint8Array([1, 2, 3, 4]),
      60,
    )
    if (!msg) return { result: "failed", error: "No response" }
    const code = msg.body[0] ?? 1
    return { result: code === 0 ? "success" : "failed", code }
  }

  async getRecordingFile(): Promise<{ name: string; status: string } | null> {
    this.assertCapability("recordingFile")
    const msg = await this.sendCommand(
      JensenCommand.GetRecordingFile,
      new Uint8Array(),
      5,
    )
    if (!msg || msg.body.length === 0) return null
    const name = new TextDecoder("ascii")
      .decode(msg.body)
      .replace(/\0/g, "")
      .trim()
    if (!name) return null
    return { name, status: "recording_active_or_last" }
  }

  async getBatteryStatus(): Promise<BatteryStatus | null> {
    this.assertCapability("battery")
    const msg = await this.sendCommand(
      JensenCommand.GetBatteryStatus,
      new Uint8Array(),
      5,
    )
    if (!msg || msg.body.length < 6) return null
    const statusCode = msg.body[0] & 0xff
    return {
      status:
        statusCode === 0 ? "idle" : statusCode === 1 ? "charging" : "full",
      battery: msg.body[1] & 0xff,
      voltage: readUint32BE(msg.body, 2),
    }
  }

  async getDeviceTime(): Promise<{ time: string }> {
    const msg = await this.sendCommand(
      JensenCommand.GetDeviceTime,
      new Uint8Array(),
      5,
    )
    if (!msg) throw new Error("Failed to get device time")
    return { time: parseBcdDeviceTime(msg.body) }
  }

  async setDeviceTime(date: Date): Promise<GenericResult> {
    const year = date.getFullYear()
    const payload = new Uint8Array([
      toBcd(Math.floor(year / 100)),
      toBcd(year % 100),
      toBcd(date.getMonth() + 1),
      toBcd(date.getDate()),
      toBcd(date.getHours()),
      toBcd(date.getMinutes()),
      toBcd(date.getSeconds()),
    ])
    const msg = await this.sendCommand(JensenCommand.SetDeviceTime, payload, 5)
    if (!msg) return { result: "failed", error: "No response" }
    const code = msg.body[0] ?? 1
    return { result: code === 0 ? "success" : "failed", code }
  }

  async getSettings(): Promise<DeviceSettings> {
    this.assertCapability("settings")
    if (this.usesLegacySettingsFallback()) {
      return {
        autoRecord: false,
        autoPlay: false,
        bluetoothTone: false,
      }
    }
    const msg = await this.sendCommand(
      JensenCommand.GetSettings,
      new Uint8Array(),
      5,
    )
    if (!msg) throw new Error("Failed to get settings")
    return parseSettings(msg.body)
  }

  async setSettings(settings: Partial<DeviceSettings>): Promise<GenericResult> {
    this.assertCapability("settings")
    if (this.usesLegacySettingsFallback()) {
      return {
        result: "failed",
        error: "Settings writes require H1/H1E firmware 327714 or newer.",
      }
    }
    if (settings.recordOnVibe != null) this.assertCapability("recordOnVibe")
    if (settings.bluetoothTone != null)
      this.assertCapability("bluetoothPromptSetting")
    const payload = new Uint8Array(settings.recordOnVibe == null ? 16 : 20)
    if (settings.autoRecord != null) payload[3] = settings.autoRecord ? 1 : 2
    if (settings.autoPlay != null) payload[7] = settings.autoPlay ? 1 : 2
    if (settings.notificationSound != null)
      payload[11] = settings.notificationSound ? 1 : 2
    if (settings.bluetoothTone != null)
      payload[15] = settings.bluetoothTone ? 2 : 1
    if (settings.recordOnVibe != null)
      payload[19] = settings.recordOnVibe ? 1 : 2
    const msg = await this.sendCommand(JensenCommand.SetSettings, payload, 5)
    return genericResult(msg)
  }

  async setNotification(enabled: boolean): Promise<GenericResult> {
    return this.setSettings({ notificationSound: enabled })
  }

  async beginBncDemo(): Promise<GenericResult> {
    return genericResult(
      await this.sendCommand(JensenCommand.BncDemo, new Uint8Array([1]), 5),
    )
  }

  async endBncDemo(): Promise<GenericResult> {
    return genericResult(
      await this.sendCommand(JensenCommand.BncDemo, new Uint8Array([0]), 5),
    )
  }

  async startBluetoothScan(count: number): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.BluetoothScan,
        new Uint8Array([1, count & 0xff]),
        5,
      ),
    )
  }

  async stopBluetoothScan(): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.BluetoothScan,
        new Uint8Array([0, 0]),
        5,
      ),
    )
  }

  async getBluetoothScanResults(): Promise<BluetoothDeviceInfo[]> {
    this.assertCapability("bluetooth")
    const msg = await this.sendCommand(
      JensenCommand.GetBluetoothScanResults,
      new Uint8Array(),
      5,
    )
    return msg ? parseBluetoothDevices(msg.body) : []
  }

  async getPairedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
    this.assertCapability("bluetooth")
    const msg = await this.sendCommand(
      JensenCommand.GetPairedBluetoothDevices,
      new Uint8Array(),
      5,
    )
    return msg ? parsePairedBluetoothDevices(msg.body) : []
  }

  async clearPairedBluetoothDevices(): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.ClearPairedBluetoothDevices,
        new Uint8Array([0]),
        5,
      ),
    )
  }

  async getBluetoothStatus(): Promise<BluetoothStatus | null> {
    this.assertCapability("bluetoothStatus")
    const msg = await this.sendCommand(
      JensenCommand.GetBluetoothStatus,
      new Uint8Array(),
      5,
    )
    return msg ? parseBluetoothStatus(msg.body) : null
  }

  async disconnectBluetoothDevice(): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.BluetoothCommand,
        new Uint8Array([1]),
        10,
      ),
    )
  }

  async connectBluetoothDevice(mac: string): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.BluetoothCommand,
        new Uint8Array([0, ...parseBluetoothMac(mac)]),
        10,
      ),
    )
  }

  async reconnectBluetoothDevice(mac: string): Promise<GenericResult> {
    this.assertCapability("bluetooth")
    return genericResult(
      await this.sendCommand(
        JensenCommand.BluetoothCommand,
        new Uint8Array([3, ...parseBluetoothMac(mac)]),
        10,
      ),
    )
  }

  async getWebUsbTimeout(): Promise<{ timeout: number }> {
    this.assertCapability("webUsbTimeout")
    const msg = await this.sendCommand(
      JensenCommand.GetWebUsbTimeout,
      new Uint8Array(),
      5,
    )
    if (!msg || msg.body.length < 4)
      throw new Error("Failed to get WebUSB timeout")
    return { timeout: readUint32BE(msg.body) }
  }

  async setWebUsbTimeout(timeoutMs: number): Promise<GenericResult> {
    this.assertCapability("webUsbTimeout")
    return genericResult(
      await this.sendCommand(
        JensenCommand.SetWebUsbTimeout,
        new Uint8Array(writeUint32BE(timeoutMs)),
        5,
      ),
    )
  }

  async sendKeyCode(key: number, action: number): Promise<GenericResult> {
    return genericResult(
      await this.sendCommand(
        JensenCommand.SendKeyCode,
        new Uint8Array([key & 0xff, action & 0xff]),
        5,
      ),
    )
  }

  async enterMassStorageMode(): Promise<GenericResult> {
    const result = genericResult(
      await this.sendCommand(
        JensenCommand.EnterMassStorageMode,
        new Uint8Array([1]),
        5,
      ),
    )
    if (result.result === "success") {
      await this.clearTransport(
        new Error("Device entered mass-storage mode"),
        true,
      )
      this.setConnectionState("disconnected")
    }
    return result
  }

  async getRecordingStatus(): Promise<RecordingStatus> {
    const msg = await this.sendCommand(
      JensenCommand.GetRecordingStatus,
      new Uint8Array(),
      5,
    )
    return parseRecordingStatus(msg?.body ?? new Uint8Array())
  }

  async getRecordingQuality(): Promise<{ quality: RecordingQuality }> {
    const msg = await this.sendCommand(
      JensenCommand.GetRecordingQuality,
      new Uint8Array(),
      5,
    )
    const code = msg && msg.body.length >= 4 ? readUint32BE(msg.body) : 0
    return { quality: code === 0 ? "normal" : "high" }
  }

  async setRecordingQuality(quality: RecordingQuality): Promise<GenericResult> {
    const code = quality === "normal" ? 0 : 1
    return genericResult(
      await this.sendCommand(
        JensenCommand.SetRecordingQuality,
        new Uint8Array(writeUint32BE(code)),
        5,
      ),
    )
  }

  async getAudioInputDevice(): Promise<{ device: AudioInputDevice }> {
    const msg = await this.sendCommand(
      JensenCommand.GetAudioInputDevice,
      new Uint8Array(),
      5,
    )
    const code = msg && msg.body.length >= 4 ? readUint32BE(msg.body) : 0
    return { device: code === 0 ? "bt-mic" : "mic" }
  }

  async setAudioInputDevice(device: AudioInputDevice): Promise<GenericResult> {
    const code = device === "bt-mic" ? 0 : 1
    return genericResult(
      await this.sendCommand(
        JensenCommand.SetAudioInputDevice,
        new Uint8Array(writeUint32BE(code)),
        5,
      ),
    )
  }

  async startRealtime(mode: number): Promise<GenericResult | null> {
    this.assertCapability("startRealtime")
    this.liveMode = true
    const msg = await this.sendCommand(
      JensenCommand.RealtimeControl,
      new Uint8Array([0, 0, 0, 1, 0, 0, 0, mode & 0x03]),
      5,
    )
    return genericResult(msg)
  }

  async stopRealtime(): Promise<GenericResult> {
    this.liveMode = false
    return genericResult(
      await this.sendCommand(
        JensenCommand.RealtimeControl,
        new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]),
        5,
      ),
    )
  }

  async pauseRealtime(): Promise<GenericResult> {
    if (!this.liveMode)
      return { result: "failed", error: "Realtime is not active" }
    this.liveMode = false
    return genericResult(
      await this.sendCommand(
        JensenCommand.RealtimeControl,
        new Uint8Array([0, 0, 0, 2, 0, 0, 0, 0]),
        5,
      ),
    )
  }

  async getRealtime(): Promise<RealtimeStatus> {
    this.liveMode = true
    const msg = await this.sendCommand(
      JensenCommand.GetRealtime,
      new Uint8Array(),
      5,
    )
    if (!msg) throw new Error("Failed to get realtime audio status")
    return parseRealtimeStatus(msg.body)
  }
}
