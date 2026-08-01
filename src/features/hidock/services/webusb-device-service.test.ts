import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { JensenCommand } from "@/features/hidock/jensen/constants"
import { encodeJensenFrame } from "@/features/hidock/jensen/frame-codec"
import { WebUsbDeviceService } from "@/features/hidock/services/webusb-device-service"

function fileListEntry(): Uint8Array {
  const name = new TextEncoder().encode("20260726123456REC1.wav")
  return new Uint8Array([
    8,
    0,
    0,
    name.length,
    ...name,
    0,
    4,
    226,
    44,
    0,
    0,
    0,
    0,
    0,
    0,
    ...Array.from({ length: 16 }, (_, index) => index),
  ])
}

class FakeUsbDevice implements USBDevice {
  opened = false
  vendorId = 4310
  productId = 45068
  productName = "HiDock H1"
  serialNumber = "BROWSER-SERIAL"
  configuration: USBConfiguration | null = null
  readonly writes: number[] = []
  readonly setupCalls: string[] = []
  firmwareBytes = [0, 5, 1, 8]
  private chunks: Uint8Array[] = []
  private readers: Array<(result: USBInTransferResult) => void> = []

  async open(): Promise<void> {
    this.opened = true
    this.setupCalls.push("open")
  }

  async close(): Promise<void> {
    this.opened = false
    this.setupCalls.push("close")
  }

  async selectConfiguration(configurationValue: number): Promise<void> {
    this.configuration = { configurationValue, interfaces: [] }
    this.setupCalls.push(`configuration:${configurationValue}`)
  }

  async selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number,
  ): Promise<void> {
    this.setupCalls.push(`alternate:${interfaceNumber}:${alternateSetting}`)
  }

  async claimInterface(interfaceNumber: number): Promise<void> {
    this.setupCalls.push(`claim:${interfaceNumber}`)
  }

  async releaseInterface(): Promise<void> {
    return
  }

  async transferIn(): Promise<USBInTransferResult> {
    const chunk = this.chunks.shift()
    if (chunk) return this.transferResult(chunk)
    return new Promise((resolve) => this.readers.push(resolve))
  }

  async transferOut(
    _endpointNumber: number,
    source: BufferSource,
  ): Promise<USBOutTransferResult> {
    const bytes =
      source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    const command = (bytes[2] << 8) | bytes[3]
    const sequence =
      (bytes[4] * 0x1000000 + (bytes[5] << 16) + (bytes[6] << 8) + bytes[7]) >>>
      0
    this.writes.push(command)

    if (command === JensenCommand.GetDeviceInfo) {
      const serial = new TextEncoder().encode("DEVICE-SERIAL")
      this.enqueue(
        encodeJensenFrame(
          command,
          sequence,
          new Uint8Array([...this.firmwareBytes, ...serial, 0, 0, 0]),
        ),
      )
    } else if (command === JensenCommand.GetFileCount) {
      this.enqueue(
        encodeJensenFrame(command, sequence, new Uint8Array([0, 0, 0, 1])),
      )
    } else if (command === JensenCommand.GetFileList) {
      const entry = fileListEntry()
      const payload = new Uint8Array([0xff, 0xff, 0, 0, 0, 1, ...entry])
      const split = 17
      this.enqueue(
        encodeJensenFrame(command, sequence, payload.slice(0, split)),
      )
      this.enqueue(
        encodeJensenFrame(command, sequence + 99, payload.slice(split)),
      )
    } else if (command === JensenCommand.GetSettings) {
      const settings = new Uint8Array(16)
      settings[3] = 1
      this.enqueue(encodeJensenFrame(command, sequence, settings))
    } else if (command === JensenCommand.GetWebUsbTimeout) {
      this.enqueue(encodeJensenFrame(command, sequence, new Uint8Array([0])))
    }
    return { status: "ok", bytesWritten: bytes.length }
  }

  private enqueue(chunk: Uint8Array): void {
    const reader = this.readers.shift()
    if (reader) reader(this.transferResult(chunk))
    else this.chunks.push(chunk)
  }

  private transferResult(chunk: Uint8Array): USBInTransferResult {
    return {
      status: "ok",
      data: new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    }
  }
}

class FakeUsb implements USB {
  requestCount = 0
  private listeners = new Map<
    "connect" | "disconnect",
    Set<(event: USBConnectionEvent) => void>
  >()

  constructor(readonly device: USBDevice) {}

  async getDevices(): Promise<USBDevice[]> {
    return [this.device]
  }

  async requestDevice(): Promise<USBDevice> {
    this.requestCount += 1
    return this.device
  }

  addEventListener(
    type: "connect" | "disconnect",
    listener: (event: USBConnectionEvent) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(
    type: "connect" | "disconnect",
    listener: (event: USBConnectionEvent) => void,
  ): void {
    this.listeners.get(type)?.delete(listener)
  }

  disconnect(): void {
    const event = { device: this.device } as USBConnectionEvent
    for (const listener of this.listeners.get("disconnect") ?? [])
      listener(event)
  }
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined)
  vi.spyOn(console, "debug").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("WebUsbDeviceService Jensen integration", () => {
  it("auto-opens a HiNotes PID with the reference USB interface setup", async () => {
    const device = new FakeUsbDevice()
    const usb = new FakeUsb(device)
    vi.stubGlobal("navigator", { usb })
    const service = new WebUsbDeviceService()

    const info = await service.connect()

    expect(usb.requestCount).toBe(0)
    expect(device.setupCalls).toEqual([
      "open",
      "configuration:1",
      "claim:0",
      "alternate:0:0",
    ])
    expect(info).toMatchObject({
      connected: true,
      identified: true,
      model: "hidock-h1",
      firmwareVersion: "5.1.8",
      versionNumber: 327944,
      serial: "DEVICE-SERIAL",
    })
    service.dispose()
    await vi.waitFor(() => expect(device.opened).toBe(false))
  })

  it("sends command 4 once and consumes fragmented streamed list replies", async () => {
    const device = new FakeUsbDevice()
    vi.stubGlobal("navigator", { usb: new FakeUsb(device) })
    const service = new WebUsbDeviceService()
    await service.connect()

    const progress: number[] = []
    const files = await service.listFiles((partial) =>
      progress.push(partial.length),
    )

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      filename: "20260726123456REC1.wav",
      durationSec: 10,
      version: 8,
    })
    expect(
      device.writes.filter((command) => command === JensenCommand.GetFileList),
    ).toHaveLength(1)
    expect(progress).toEqual([1])
    service.dispose()
  })

  it("moves to disconnected and settles active work after an unplug event", async () => {
    const device = new FakeUsbDevice()
    const usb = new FakeUsb(device)
    vi.stubGlobal("navigator", { usb })
    const service = new WebUsbDeviceService()
    const states: string[] = []
    service.subscribeConnectionState((state) => states.push(state))
    await service.connect()
    const pending = service.getWebUsbTimeout()
    const rejected = expect(pending).rejects.toThrow("unplugged")
    await vi.waitFor(() =>
      expect(device.writes).toContain(JensenCommand.GetWebUsbTimeout),
    )

    usb.disconnect()

    await rejected
    await vi.waitFor(() => expect(states.at(-1)).toBe("disconnected"))
    expect(device.opened).toBe(false)
    service.dispose()
  })

  it("uses the safe settings fallback on legacy H1 firmware without sending command 11", async () => {
    const device = new FakeUsbDevice()
    device.firmwareBytes = [0, 5, 0, 1]
    vi.stubGlobal("navigator", { usb: new FakeUsb(device) })
    const service = new WebUsbDeviceService()
    await service.connect()

    await expect(service.getSettings()).resolves.toMatchObject({
      autoRecord: false,
      autoPlay: false,
    })
    expect(device.writes).not.toContain(JensenCommand.GetSettings)
    service.dispose()
  })

  it("blocks the unsupported P1 Mini WebUSB-timeout command before writing to USB", async () => {
    const device = new FakeUsbDevice()
    device.productId = 8257
    device.productName = "HiDock P1 Mini"
    vi.stubGlobal("navigator", { usb: new FakeUsb(device) })
    const service = new WebUsbDeviceService()
    await service.connect()

    await expect(service.getWebUsbTimeout()).rejects.toThrow(
      "WebUSB timeout commands are not supported by the P1 Mini.",
    )
    expect(device.writes).not.toContain(JensenCommand.GetWebUsbTimeout)
    service.dispose()
  })

  it("returns to idle when the WebUSB picker is cancelled", async () => {
    const device = new FakeUsbDevice()
    const usb = new FakeUsb(device)
    vi.spyOn(usb, "getDevices").mockResolvedValue([])
    vi.spyOn(usb, "requestDevice").mockRejectedValue(
      new Error("NotFoundError: No device selected"),
    )
    vi.stubGlobal("navigator", { usb })
    const service = new WebUsbDeviceService()
    const states: string[] = []
    service.subscribeConnectionState((state) => states.push(state))

    await expect(service.connect()).rejects.toThrow(
      "device picker did not return a device",
    )
    expect(states.at(-1)).toBe("idle")
    service.dispose()
  })

  it("clears a partially opened session when USB interface setup fails", async () => {
    const device = new FakeUsbDevice()
    vi.spyOn(device, "claimInterface").mockRejectedValue(
      new Error("Interface claim failed"),
    )
    vi.stubGlobal("navigator", { usb: new FakeUsb(device) })
    const service = new WebUsbDeviceService()
    const states: string[] = []
    service.subscribeConnectionState((state) => states.push(state))

    await expect(service.connect()).rejects.toThrow("Interface claim failed")
    expect(states.at(-1)).toBe("idle")
    expect(device.opened).toBe(false)
    service.dispose()
  })
})
