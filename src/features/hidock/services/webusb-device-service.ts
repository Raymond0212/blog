import { formatDuration } from "@/features/hidock/utils/format"
import { logger } from "@/features/hidock/utils/logger"
import type { DeviceService } from "@/features/hidock/services/device-service"
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
} from "@/features/hidock/types/device"

const DEFAULT_VIDS = [0x10d6, 0x3887]
const KNOWN_PIDS = [0xaf0c, 0xaf0d, 0xb00d, 0xaf0e, 0xb00e, 0xaf0f, 0x0100, 0x0101, 0x0102, 0x0103, 0x2040, 0x2041]

const CMD_GET_DEVICE_INFO = 1
const CMD_GET_DEVICE_TIME = 2
const CMD_SET_DEVICE_TIME = 3
const CMD_GET_FILE_LIST = 4
const CMD_TRANSFER_FILE = 5
const CMD_GET_FILE_COUNT = 6
const CMD_DELETE_FILE = 7
const CMD_BNC_DEMO = 10
const CMD_GET_SETTINGS = 11
const CMD_SET_SETTINGS = 12
const CMD_GET_CARD_INFO = 16
const CMD_FORMAT_CARD = 17
const CMD_GET_RECORDING_FILE = 18
const CMD_GET_BATTERY_STATUS = 4100
const CMD_START_STOP_BLUETOOTH_SCAN = 4101
const CMD_GET_BLUETOOTH_SCAN_RESULTS = 4102
const CMD_GET_PAIRED_BLUETOOTH_DEVICES = 4103
const CMD_CLEAR_PAIRED_BLUETOOTH_DEVICES = 4104
const CMD_BLUETOOTH_COMMAND = 4098
const CMD_GET_BLUETOOTH_STATUS = 4099
const CMD_SET_AUDIO_INPUT_DEVICE = 4105
const CMD_GET_AUDIO_INPUT_DEVICE = 4106
const CMD_ENTER_MASS_STORAGE_MODE = 61455
const CMD_SET_WEBUSB_TIMEOUT = 61456
const CMD_GET_WEBUSB_TIMEOUT = 61457
const CMD_SEND_KEY_CODE = 28
const CMD_GET_RECORDING_STATUS = 29
const CMD_SET_RECORDING_QUALITY = 30
const CMD_GET_RECORDING_QUALITY = 31
const CMD_REALTIME_CONTROL = 33
const CMD_GET_REALTIME = 34

const OUT_EP = 1
const IN_EP = 2
const IFACE = 0
const ALT = 0
const CONFIG = 1

function toHex(v?: number): string | undefined {
  return v == null ? undefined : `0x${v.toString(16)}`
}

function productModel(pid?: number): string | undefined {
  if (pid === 0xaf0c || pid === 0x0100 || pid === 0x0102) return "hidock-h1"
  if (pid === 0xaf0d || pid === 0x0101 || pid === 0x0103) return "hidock-h1e"
  if (pid === 0xaf0e || pid === 0x2040) return "hidock-p1"
  if (pid === 0xaf0f || pid === 0x2041) return "hidock-p1:mini"
  if (pid === 0xb00d || pid === 0xb00e) return "hidock-h1:lite"
  return undefined
}

function readUint32BE(bytes: Uint8Array, offset = 0): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function writeUint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function genericResult(msg: UsbMessage | null): GenericResult {
  if (!msg) return { result: "failed", error: "No response" }
  const code = msg.body[0] ?? 1
  return { result: code === 0 ? "success" : "failed", code }
}

function parseBluetoothDevices(body: Uint8Array): BluetoothDeviceInfo[] {
  if (body.length === 0) return []
  const count = ((body[0] & 0xff) << 8) | (body[1] & 0xff)
  const decoder = new TextDecoder("utf-8")
  const devices: BluetoothDeviceInfo[] = []
  let offset = 2

  for (let i = 0; i < count && offset < body.length; i += 1) {
    if (offset + 2 > body.length) break
    const nameLen = ((body[offset++] & 0xff) << 8) | (body[offset++] & 0xff)
    if (offset + nameLen + 10 > body.length) break
    const nameBytes = body.slice(offset, offset + nameLen)
    offset += nameLen
    const mac = Array.from(body.slice(offset, offset + 6))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join("-")
    offset += 6
    const rssi = body[offset++] & 0xff
    const cod = ((body[offset++] & 0xff) << 16) | ((body[offset++] & 0xff) << 8) | (body[offset++] & 0xff)
    devices.push({
      name: decoder.decode(nameBytes).replace(/\0+$/g, ""),
      mac,
      rssi,
      cod,
      audio: ((cod & 0x1f00) >> 8) === 4,
    })
  }

  return devices
}

function macToBytes(mac: string): number[] {
  const parts = mac.split("-")
  if (parts.length !== 6) throw new Error("Bluetooth MAC must use AA-BB-CC-DD-EE-FF format")
  return parts.map((part) => {
    const value = Number.parseInt(part, 16)
    if (!Number.isFinite(value) || value < 0 || value > 255) throw new Error("Bluetooth MAC contains an invalid byte")
    return value
  })
}

function toBcd(v: number): number {
  return ((Math.floor(v / 10) << 4) | (v % 10)) & 0xff
}

function parseBcdTime(body: Uint8Array): string {
  if (body.length < 7) return "unknown"
  const digits = Array.from(body.slice(0, 7))
    .map((b) => `${(b >> 4) & 0x0f}${b & 0x0f}`)
    .join("")
  if (digits === "00000000000000") return "unknown"
  const yyyy = digits.slice(0, 4)
  const mm = digits.slice(4, 6)
  const dd = digits.slice(6, 8)
  const hh = digits.slice(8, 10)
  const mi = digits.slice(10, 12)
  const ss = digits.slice(12, 14)
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function estimateHiDockDurationSec(fileLength: number, version: number, filename: string): number {
  if (fileLength <= 0) return 0

  if (version === 1) return Math.floor(fileLength / 16)
  if (version === 2) return Math.floor(Math.max(0, fileLength - 44) / 96)
  if (version === 3) return Math.floor(Math.max(0, fileLength - 44) / 192)
  if (version === 5) return Math.floor(fileLength / 12)
  if (version === 6) return Math.floor(fileLength / 16)
  if (version === 7) return Math.floor(fileLength / 10)

  if (/^\d{14}REC\d+\.wav$/i.test(filename)) return Math.floor(fileLength / 32)
  if (/^(\d{2})?(\d{2})(\w{3})(\d{2})-\d{6}-.*\.(hda|wav)$/i.test(filename)) {
    return Math.floor(fileLength / 8)
  }

  return 0
}

function parseHiDockFilenameDate(name: string): string {
  if (/^\d{14}/.test(name)) {
    const s = name.slice(0, 14)
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
  }

  const match = name.match(/^(\d{2})?(\d{2})([A-Za-z]{3})(\d{2})-(\d{2})(\d{2})(\d{2})-.*\.(hda|wav)$/)
  if (match) {
    const year = `20${match[2]}`
    const month = monthNumber(match[3])
    if (!month) return "-"
    return `${year}-${month}-${match[4]} ${match[5]}:${match[6]}:${match[7]}`
  }

  return "-"
}

function monthNumber(month: string): string | null {
  const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
    month.toLowerCase()
  )
  return idx === -1 ? null : String(idx + 1).padStart(2, "0")
}

type PendingResolver = {
  resolve: (v: { cmd: number; seq: number; body: Uint8Array } | null) => void
  timeout: ReturnType<typeof setTimeout>
}

type UsbMessage = { cmd: number; seq: number; body: Uint8Array }

export class WebUsbDeviceService implements DeviceService {
  private device: USBDevice | null = null
  private seq = Date.now() >>> 0
  private pending = new Map<string, PendingResolver>()
  private pendingByCmd = new Map<number, PendingResolver[]>()
  private queuedByCmd = new Map<number, UsbMessage[]>()
  private rxBuf: Uint8Array = new Uint8Array(0)
  private readLoopRunning = false
  private cachedDeviceInfo: DeviceInfo | null = null

  getCapability() {
    const hasUsb = typeof navigator !== "undefined" && Boolean(navigator.usb)
    const hasPicker = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function"
    return {
      canUsbOperate: hasUsb,
      canPickFolder: hasPicker,
      runtime: "browser" as const,
      transport: hasUsb ? ("webusb" as const) : ("ui-only" as const),
      reason: hasUsb ? undefined : "WebUSB is unavailable. Use Chrome/Edge desktop with secure context (https or localhost).",
    }
  }

  private nextSeq(): number {
    this.seq = (this.seq + 1) >>> 0
    return this.seq
  }

  private makeFrame(cmd: number, seq: number, body = new Uint8Array()): Uint8Array {
    const len = body.length
    const out = new Uint8Array(12 + len)
    let i = 0
    out[i++] = 0x12
    out[i++] = 0x34
    out[i++] = (cmd >> 8) & 0xff
    out[i++] = cmd & 0xff
    out[i++] = (seq >>> 24) & 0xff
    out[i++] = (seq >>> 16) & 0xff
    out[i++] = (seq >>> 8) & 0xff
    out[i++] = seq & 0xff
    out[i++] = (len >>> 24) & 0xff
    out[i++] = (len >>> 16) & 0xff
    out[i++] = (len >>> 8) & 0xff
    out[i++] = len & 0xff
    out.set(body, i)
    return out
  }

  private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
  }

  private parseFramesFromBuffer(buffer: Uint8Array) {
    const msgs: Array<{ cmd: number; seq: number; body: Uint8Array }> = []
    let off = 0

    while (off + 12 <= buffer.length) {
      if (buffer[off] !== 0x12 || buffer[off + 1] !== 0x34) {
        off += 1
        continue
      }
      const cmd = (buffer[off + 2] << 8) | buffer[off + 3]
      const seq = ((buffer[off + 4] << 24) | (buffer[off + 5] << 16) | (buffer[off + 6] << 8) | buffer[off + 7]) >>> 0
      const len = ((buffer[off + 8] << 24) | (buffer[off + 9] << 16) | (buffer[off + 10] << 8) | buffer[off + 11]) >>> 0
      const total = 12 + len
      if (off + total > buffer.length) break

      const body = buffer.slice(off + 12, off + total)
      msgs.push({ cmd, seq, body })
      off += total
    }

    return { msgs, rest: buffer.slice(off) }
  }

  private startReadLoop() {
    if (this.readLoopRunning || !this.device) return
    this.readLoopRunning = true

    ;(async () => {
      while (this.readLoopRunning && this.device) {
        try {
          const r = await this.device.transferIn(IN_EP, 512 * 1024)
          if (!r?.data) continue
          const chunk = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)
          this.rxBuf = this.concat(this.rxBuf, chunk)

          const { msgs, rest } = this.parseFramesFromBuffer(this.rxBuf)
          this.rxBuf = rest

          for (const m of msgs) {
            const wait = this.pending.get(`${m.cmd}-${m.seq}`)
            if (wait) {
              clearTimeout(wait.timeout)
              this.pending.delete(`${m.cmd}-${m.seq}`)
              wait.resolve(m)
              continue
            }
            const cmdWaiters = this.pendingByCmd.get(m.cmd)
            if (cmdWaiters && cmdWaiters.length > 0) {
              const cmdWait = cmdWaiters.shift()
              if (cmdWait) {
                clearTimeout(cmdWait.timeout)
                cmdWait.resolve(m)
                if (cmdWaiters.length === 0) this.pendingByCmd.delete(m.cmd)
                continue
              }
            }
            const queued = this.queuedByCmd.get(m.cmd) ?? []
            queued.push(m)
            this.queuedByCmd.set(m.cmd, queued)
          }
        } catch {
          await new Promise((r) => setTimeout(r, 30))
        }
      }
    })()
  }

  private async sendCommand(cmd: number, body = new Uint8Array(), timeoutSec = 8) {
    logger.debug("webusb", "sendCommand", { cmd, bodyLen: body.length, timeoutSec })
    if (!this.device) throw new Error("Device not connected")
    const seq = this.nextSeq()
    const frame = this.makeFrame(cmd, seq, body)
    const key = `${cmd}-${seq}`

    const p = new Promise<{ cmd: number; seq: number; body: Uint8Array } | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key)
        resolve(null)
      }, timeoutSec * 1000)
      this.pending.set(key, { resolve, timeout })
    })

    const out = await this.device.transferOut(OUT_EP, new Uint8Array(frame))
    if (out.status !== "ok") {
      this.pending.delete(key)
      throw new Error(`USB write failed: ${out.status}`)
    }

    return p
  }

  private async waitForCommand(cmd: number, timeoutSec = 2): Promise<UsbMessage | null> {
    const queued = this.queuedByCmd.get(cmd)
    if (queued && queued.length > 0) {
      const msg = queued.shift() ?? null
      if (queued.length === 0) this.queuedByCmd.delete(cmd)
      return msg
    }

    return new Promise<UsbMessage | null>((resolve) => {
      const timeout = setTimeout(() => {
        const waiters = this.pendingByCmd.get(cmd) ?? []
        const idx = waiters.findIndex((w) => w.timeout === timeout)
        if (idx >= 0) waiters.splice(idx, 1)
        if (waiters.length === 0) this.pendingByCmd.delete(cmd)
        resolve(null)
      }, timeoutSec * 1000)

      const waiters = this.pendingByCmd.get(cmd) ?? []
      waiters.push({ resolve, timeout })
      this.pendingByCmd.set(cmd, waiters)
    })
  }

  async connect(): Promise<DeviceInfo> {
    logger.info("webusb", "connect requested")
    if (!navigator.usb) throw new Error("WebUSB is not supported in this browser")

    const known = await navigator.usb.getDevices()
    const existing = known.find((d: USBDevice) => DEFAULT_VIDS.includes(d.vendorId) && KNOWN_PIDS.includes(d.productId))

    let device: USBDevice
    try {
      device = existing ?? (await navigator.usb.requestDevice({ filters: DEFAULT_VIDS.map((vendorId) => ({ vendorId })) }))
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error)
      const lower = msg.toLowerCase()
      if (lower.includes("no device selected") || lower.includes("notfounderror")) {
        throw new Error("WebUSB device picker did not return a device. Open this app in Chrome/Edge directly and try again.")
      }
      if (lower.includes("securityerror") || lower.includes("notallowederror")) {
        throw new Error("WebUSB access was blocked by browser security/permission policy. Use Chrome/Edge desktop on localhost/HTTPS.")
      }
      throw error
    }

    if (!device.opened) await device.open()
    if (device.configuration?.configurationValue !== CONFIG) await device.selectConfiguration(CONFIG)
    await device.claimInterface(IFACE)
    await device.selectAlternateInterface(IFACE, ALT)

    this.device = device
    this.rxBuf = new Uint8Array(0)
    this.pending.clear()
    this.startReadLoop()

    const info = await this.readDeviceInfoRaw().catch(() => ({ connected: true } as DeviceInfo))
    this.cachedDeviceInfo = {
      ...info,
      connected: true,
      vid: toHex(device.vendorId),
      pid: toHex(device.productId),
      serial: device.serialNumber ?? undefined,
    }
    return this.cachedDeviceInfo
  }

  async disconnect(): Promise<void> {
    this.readLoopRunning = false
    this.pending.forEach((p) => {
      clearTimeout(p.timeout)
      p.resolve(null)
    })
    this.pending.clear()
    this.pendingByCmd.forEach((arr) => {
      for (const p of arr) {
        clearTimeout(p.timeout)
        p.resolve(null)
      }
    })
    this.pendingByCmd.clear()
    this.queuedByCmd.clear()
    if (this.device?.opened) await this.device.close()
    this.device = null
    this.rxBuf = new Uint8Array(0)
    this.cachedDeviceInfo = null
  }

  private async readDeviceInfoRaw(): Promise<DeviceInfo> {
    const res = await this.sendCommand(CMD_GET_DEVICE_INFO, new Uint8Array(), 5)
    if (!res || res.cmd !== CMD_GET_DEVICE_INFO) throw new Error("Failed to get device info")
    const versionNumber = res.body.length >= 4 ? readUint32BE(res.body, 0) : 0
    const version = versionNumber
      ? `${(versionNumber >> 16) & 0xff}.${(versionNumber >> 8) & 0xff}.${versionNumber & 0xff}`
      : undefined
    const serial =
      res.body.length > 4
        ? new TextDecoder("ascii").decode(res.body.slice(4, 20)).replace(/\0/g, "").trim()
        : this.device?.serialNumber
    return {
      connected: true,
      model: productModel(this.device?.productId) ?? "HiDock Device",
      firmwareVersion: version,
      vid: toHex(this.device?.vendorId),
      pid: toHex(this.device?.productId),
      serial: serial || (this.device?.serialNumber ?? undefined),
    }
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    if (this.cachedDeviceInfo) return this.cachedDeviceInfo
    const fresh = await this.readDeviceInfoRaw()
    this.cachedDeviceInfo = fresh
    return fresh
  }

  async getFileCount(): Promise<number> {
    const msg = await this.sendCommand(CMD_GET_FILE_COUNT, new Uint8Array(), 5)
    if (!msg || msg.body.length < 4) return 0
    return readUint32BE(msg.body)
  }

  private parseFilenameDate(name: string): string {
    return parseHiDockFilenameDate(name)
  }

  private parseFileListPayload(bytes: Uint8Array) {
    let i = 0
    let expected = -1

    if (bytes.length >= 6 && bytes[0] === 0xff && bytes[1] === 0xff) {
      expected = ((bytes[2] << 24) | (bytes[3] << 16) | (bytes[4] << 8) | bytes[5]) >>> 0
      i = 6
    }

    const files: HiDockFile[] = []
    while (i < bytes.length) {
      if (i + 4 > bytes.length) break
      const version = bytes[i++]
      const nameLen = (bytes[i++] << 16) | (bytes[i++] << 8) | bytes[i++]
      if (i + nameLen > bytes.length) break

      const nameBytes = bytes.slice(i, i + nameLen)
      i += nameLen
      const filename = new TextDecoder("ascii").decode(nameBytes).replace(/\0+$/g, "")

      if (i + 4 + 6 + 16 > bytes.length) break
      const length = ((bytes[i++] << 24) | (bytes[i++] << 16) | (bytes[i++] << 8) | bytes[i++]) >>> 0
      i += 6
      const signature = Array.from(bytes.slice(i, i + 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      i += 16

      const durationSec = estimateHiDockDurationSec(length, version, filename)
      const modeRaw = filename.replace(/^(\w{9})-(\d{6})-(.+?)\d+\.\w+$/i, "$3").toUpperCase()
      const mode = modeRaw === "WHSP" || modeRaw === "WIP" ? "whisper" : modeRaw === "CALL" ? "call" : "room"
      files.push({
        filename,
        fileLength: length,
        createdAtRaw: this.parseFilenameDate(filename),
        durationSec,
        durationLabel: formatDuration(durationSec),
        mode,
        version,
        signature,
      })
    }

    return { files, expected }
  }

  async listFiles(onPartial?: (files: HiDockFile[]) => void): Promise<HiDockFile[]> {
    const countHint = await this.getFileCount().catch(() => 0)
    let aggregate = new Uint8Array(0)
    let done = false
    let rounds = 0
    let lastEmitted = 0
    let consecutiveNulls = 0
    const startedAt = Date.now()
    const maxDurationMs = 15000

    while (!done && rounds < 20) {
      if (Date.now() - startedAt > maxDurationMs) break

      rounds += 1
      const msg = await this.sendCommand(CMD_GET_FILE_LIST, new Uint8Array(), 3)
      if (!msg || !msg.body) {
        consecutiveNulls += 1
        if (consecutiveNulls >= 2) break
        continue
      }
      consecutiveNulls = 0
      if (msg.body.length === 0) break

      const merged = new Uint8Array(aggregate.length + msg.body.length)
      merged.set(aggregate, 0)
      merged.set(msg.body, aggregate.length)
      aggregate = merged

      const parsed = this.parseFileListPayload(aggregate)
      if (onPartial && parsed.files.length > lastEmitted) {
        onPartial(parsed.files)
        lastEmitted = parsed.files.length
      }

      if ((parsed.expected >= 0 && parsed.files.length >= parsed.expected) || (countHint > 0 && parsed.files.length >= countHint)) {
        done = true
      }
    }

    const final = this.parseFileListPayload(aggregate).files
    if (final.length === 0 && countHint > 0) {
      throw new Error("Timed out while listing files from device")
    }
    return final
  }

  async downloadFiles(
    files: HiDockFile[],
    _destination: string,
    onProgress: (progress: DownloadProgress) => void,
    _options?: DownloadOptions
  ): Promise<DownloadReport> {
    void _destination
    void _options
    const aggregateTotal = files.reduce((s, f) => s + f.fileLength, 0)
    let aggregateDone = 0
    const results: DownloadFileResult[] = []

    for (const file of files) {
      let offset = 0
      let status: DownloadFileResult["status"] = "success"
      let err: string | undefined
      let failureReason: "none" | "empty_response" | "timeout" | "disconnected" | "short_read" | "exception" = "none"
      const chunks: ArrayBuffer[] = []

      try {
        this.queuedByCmd.delete(CMD_TRANSFER_FILE)
        const startBody = new TextEncoder().encode(file.filename)
        const start = await this.sendCommand(CMD_TRANSFER_FILE, startBody, 12)
        if (start?.body && start.body.length > 0) {
          const initialChunk = new Uint8Array(start.body)
          chunks.push(initialChunk.buffer.slice(initialChunk.byteOffset, initialChunk.byteOffset + initialChunk.byteLength) as ArrayBuffer)
          offset += initialChunk.length
          aggregateDone += initialChunk.length
          onProgress({ filename: file.filename, done: offset, total: file.fileLength, aggregateDone, aggregateTotal })
        }

        const deadline = Date.now() + 180000
        let consecutiveEmpty = 0
        while (offset < file.fileLength) {
          if (Date.now() > deadline) {
            failureReason = "timeout"
            break
          }
          const msg = await this.waitForCommand(CMD_TRANSFER_FILE, 15)
          if (!msg) {
            failureReason = this.device ? "timeout" : "disconnected"
            break
          }
          if (!msg.body || msg.body.length === 0) {
            consecutiveEmpty += 1
            if (consecutiveEmpty >= 3) {
              failureReason = "empty_response"
              break
            }
            await sleep(100)
            continue
          }
          consecutiveEmpty = 0
          const chunk = new Uint8Array(msg.body)
          chunks.push(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer)
          offset += chunk.length
          aggregateDone += chunk.length
          onProgress({ filename: file.filename, done: offset, total: file.fileLength, aggregateDone, aggregateTotal })
        }

        if (offset > 0) {
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
            failureReason = failureReason === "none" ? "short_read" : failureReason
          }
        } else {
          status = "failed"
          err = "No data returned from device"
          failureReason = failureReason === "none" ? "empty_response" : failureReason
        }
      } catch (e) {
        status = "failed"
        err = (e as Error).message
        const lower = (err ?? "").toLowerCase()
        if (lower.includes("timeout")) failureReason = "timeout"
        else if (lower.includes("disconnect") || lower.includes("not connected") || lower.includes("device")) failureReason = "disconnected"
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

    return { files: results, totalBytesWritten: results.reduce((s, r) => s + r.bytesWritten, 0) }
  }

  async deleteFile(filename: string): Promise<DeleteResult> {
    const msg = await this.sendCommand(CMD_DELETE_FILE, new TextEncoder().encode(filename), 8)
    if (!msg || msg.cmd !== CMD_DELETE_FILE) return { result: "failed", code: -1 }
    const code = msg.body[0] ?? 2
    const map: Record<number, DeleteResult["result"]> = { 0: "success", 1: "not-exists", 2: "failed" }
    return { result: map[code] ?? "unknown_error", code }
  }

  async getCardInfo(): Promise<CardInfo> {
    const msg = await this.sendCommand(CMD_GET_CARD_INFO, new Uint8Array(), 5)
    if (!msg || msg.body.length < 12) throw new Error("Failed to get card info")
    const free = readUint32BE(msg.body, 0)
    const capacity = readUint32BE(msg.body, 4)
    const statusRaw = readUint32BE(msg.body, 8)
    return { free, used: Math.max(0, capacity - free), capacity, statusRaw, status: statusRaw.toString(16) }
  }

  async formatCard(confirmed: boolean): Promise<GenericResult> {
    if (!confirmed) return { result: "failed", error: "format requires explicit confirmation" }
    const msg = await this.sendCommand(CMD_FORMAT_CARD, new Uint8Array([1, 2, 3, 4]), 60)
    if (!msg) return { result: "failed", error: "No response" }
    const code = msg.body[0] ?? 1
    return { result: code === 0 ? "success" : "failed", code }
  }

  async getRecordingFile(): Promise<{ name: string; status: string } | null> {
    const msg = await this.sendCommand(CMD_GET_RECORDING_FILE, new Uint8Array(), 5)
    if (!msg || msg.body.length === 0) return null
    const name = new TextDecoder("ascii").decode(msg.body).replace(/\0/g, "").trim()
    if (!name) return null
    return { name, status: "recording_active_or_last" }
  }

  async getBatteryStatus(): Promise<BatteryStatus | null> {
    const msg = await this.sendCommand(CMD_GET_BATTERY_STATUS, new Uint8Array(), 5)
    if (!msg || msg.body.length < 6) return null
    const statusCode = msg.body[0] & 0xff
    return {
      status: statusCode === 0 ? "idle" : statusCode === 1 ? "charging" : "full",
      battery: msg.body[1] & 0xff,
      voltage: readUint32BE(msg.body, 2),
    }
  }

  async getDeviceTime(): Promise<{ time: string }> {
    const msg = await this.sendCommand(CMD_GET_DEVICE_TIME, new Uint8Array(), 5)
    if (!msg) throw new Error("Failed to get device time")
    return { time: parseBcdTime(msg.body) }
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
    const msg = await this.sendCommand(CMD_SET_DEVICE_TIME, payload, 5)
    if (!msg) return { result: "failed", error: "No response" }
    const code = msg.body[0] ?? 1
    return { result: code === 0 ? "success" : "failed", code }
  }

  async getSettings(): Promise<DeviceSettings> {
    const msg = await this.sendCommand(CMD_GET_SETTINGS, new Uint8Array(), 5)
    if (!msg || msg.body.length < 4) throw new Error("Failed to get settings")
    return {
      autoRecord: msg.body[3] === 1,
      autoPlay: msg.body[7] === 1,
      notificationSound: msg.body.length >= 12 ? msg.body[11] === 1 : undefined,
      bluetoothTone: msg.body[15] !== 1,
    }
  }

  async setSettings(settings: Partial<DeviceSettings>): Promise<GenericResult> {
    const current = await this.getSettings()
    const merged = { ...current, ...settings }
    const payload = new Uint8Array(16)
    payload[3] = merged.autoRecord ? 1 : 2
    payload[7] = merged.autoPlay ? 1 : 2
    payload[11] = merged.notificationSound ? 1 : 2
    payload[15] = merged.bluetoothTone ? 2 : 1
    const msg = await this.sendCommand(CMD_SET_SETTINGS, payload, 5)
    return genericResult(msg)
  }

  async setNotification(enabled: boolean): Promise<GenericResult> {
    const payload = new Uint8Array(12)
    payload[11] = enabled ? 1 : 2
    return genericResult(await this.sendCommand(CMD_SET_SETTINGS, payload, 5))
  }

  async beginBncDemo(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_BNC_DEMO, new Uint8Array([1]), 5))
  }

  async endBncDemo(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_BNC_DEMO, new Uint8Array([0]), 5))
  }

  async startBluetoothScan(count: number): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_START_STOP_BLUETOOTH_SCAN, new Uint8Array([1, count & 0xff]), 5))
  }

  async stopBluetoothScan(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_START_STOP_BLUETOOTH_SCAN, new Uint8Array([0, 0]), 5))
  }

  async getBluetoothScanResults(): Promise<BluetoothDeviceInfo[]> {
    const msg = await this.sendCommand(CMD_GET_BLUETOOTH_SCAN_RESULTS, new Uint8Array(), 5)
    return msg ? parseBluetoothDevices(msg.body) : []
  }

  async getPairedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
    const msg = await this.sendCommand(CMD_GET_PAIRED_BLUETOOTH_DEVICES, new Uint8Array(), 5)
    return msg ? parseBluetoothDevices(msg.body) : []
  }

  async clearPairedBluetoothDevices(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_CLEAR_PAIRED_BLUETOOTH_DEVICES, new Uint8Array([0]), 5))
  }

  async getBluetoothStatus(): Promise<BluetoothStatus | null> {
    const msg = await this.sendCommand(CMD_GET_BLUETOOTH_STATUS, new Uint8Array(), 5)
    if (!msg || msg.body.length < 11) return null
    const mac = Array.from(msg.body.slice(0, 6))
      .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
      .join("-")
    let i = 6
    return {
      mac,
      connected: msg.body[i++] === 1,
      a2dp: msg.body[i++] === 1,
      hfp: msg.body[i++] === 1,
      avrcp: msg.body[i++] === 1,
      battery: Math.floor(((msg.body[i] ?? 0) / 255) * 100),
    }
  }

  async disconnectBluetoothDevice(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([1]), 10))
  }

  async connectBluetoothDevice(mac: string): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([0, ...macToBytes(mac)]), 10))
  }

  async reconnectBluetoothDevice(mac: string): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_BLUETOOTH_COMMAND, new Uint8Array([3, ...macToBytes(mac)]), 10))
  }

  async getWebUsbTimeout(): Promise<{ timeout: number }> {
    const msg = await this.sendCommand(CMD_GET_WEBUSB_TIMEOUT, new Uint8Array(), 5)
    if (!msg || msg.body.length < 4) throw new Error("Failed to get WebUSB timeout")
    return { timeout: readUint32BE(msg.body) }
  }

  async setWebUsbTimeout(timeoutMs: number): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_SET_WEBUSB_TIMEOUT, new Uint8Array(writeUint32BE(timeoutMs)), 5))
  }

  async sendKeyCode(key: number, action: number): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_SEND_KEY_CODE, new Uint8Array([key & 0xff, action & 0xff]), 5))
  }

  async enterMassStorageMode(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_ENTER_MASS_STORAGE_MODE, new Uint8Array([1]), 5))
  }

  async getRecordingStatus(): Promise<RecordingStatus> {
    const msg = await this.sendCommand(CMD_GET_RECORDING_STATUS, new Uint8Array(), 5)
    if (!msg || msg.body.length === 0) return { recording: null, duration: 0, samples: [], type: null }
    let i = 0
    const typeCode = msg.body[i++] & 0xff
    const nameLen = msg.body[i++] & 0xff
    const recording = new TextDecoder("ascii").decode(msg.body.slice(i, i + nameLen)).replace(/\0+$/g, "")
    i += nameLen
    const duration = ((msg.body[i++] & 0xff) << 8) | (msg.body[i++] & 0xff)
    const sampleCount = msg.body[i++] & 0xff
    const samples = Array.from(msg.body.slice(i, i + sampleCount))
    return { recording, duration, samples, type: typeCode === 0 ? "recording" : "whisper" }
  }

  async getRecordingQuality(): Promise<{ quality: RecordingQuality }> {
    const msg = await this.sendCommand(CMD_GET_RECORDING_QUALITY, new Uint8Array(), 5)
    const code = msg && msg.body.length >= 4 ? readUint32BE(msg.body) : 0
    return { quality: code === 0 ? "normal" : "high" }
  }

  async setRecordingQuality(quality: RecordingQuality): Promise<GenericResult> {
    const code = quality === "normal" ? 0 : 1
    return genericResult(await this.sendCommand(CMD_SET_RECORDING_QUALITY, new Uint8Array(writeUint32BE(code)), 5))
  }

  async getAudioInputDevice(): Promise<{ device: AudioInputDevice }> {
    const msg = await this.sendCommand(CMD_GET_AUDIO_INPUT_DEVICE, new Uint8Array(), 5)
    const code = msg && msg.body.length >= 4 ? readUint32BE(msg.body) : 0
    return { device: code === 0 ? "bt-mic" : "mic" }
  }

  async setAudioInputDevice(device: AudioInputDevice): Promise<GenericResult> {
    const code = device === "bt-mic" ? 0 : 1
    return genericResult(await this.sendCommand(CMD_SET_AUDIO_INPUT_DEVICE, new Uint8Array(writeUint32BE(code)), 5))
  }

  async startRealtime(mode: number): Promise<GenericResult | null> {
    const msg = await this.sendCommand(CMD_REALTIME_CONTROL, new Uint8Array([0, 0, 0, 1, 0, 0, 0, mode & 0x03]), 5)
    return genericResult(msg)
  }

  async stopRealtime(): Promise<GenericResult> {
    return genericResult(await this.sendCommand(CMD_REALTIME_CONTROL, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]), 5))
  }

  async getRealtime(): Promise<RealtimeStatus> {
    const msg = await this.sendCommand(CMD_GET_REALTIME, new Uint8Array(), 5)
    if (!msg || msg.body.length < 8) throw new Error("Failed to get realtime audio status")
    const muted = readUint32BE(msg.body, 4) === 1
    return { rest: readUint32BE(msg.body, 0), muted, dataLength: msg.body.length }
  }
}
