import { formatDuration } from "@/features/hidock/utils/format"
import type {
  BluetoothDeviceInfo,
  BluetoothStatus,
  DeviceInfo,
  DeviceSettings,
  HiDockFile,
  RealtimeStatus,
  RecordingStatus,
} from "@/features/hidock/types/device"

function readUint32BE(bytes: Uint8Array, offset = 0): number {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  )
}

export function parseBcdDeviceTime(body: Uint8Array): string {
  if (body.length < 7) {
    throw new Error("Device-time response must contain 7 BCD bytes")
  }
  const digits = Array.from(body.slice(0, 7))
    .map((byte) => {
      const high = (byte >>> 4) & 0x0f
      const low = byte & 0x0f
      if (high > 9 || low > 9)
        throw new Error("Device-time response contains invalid BCD")
      return `${high}${low}`
    })
    .join("")
  if (digits === "00000000000000") return "unknown"
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`
}

export function estimateHiDockDurationSec(
  fileLength: number,
  version: number,
  filename: string,
): number {
  if (fileLength <= 0) return 0
  let durationMs = 0
  if (version === 1) durationMs = fileLength / 16
  else if (version === 2) durationMs = Math.max(0, fileLength - 44) / 96
  else if (version === 3) durationMs = Math.max(0, fileLength - 44) / 192
  else if (version === 5) durationMs = fileLength / 12
  else if (version === 6) durationMs = fileLength / 16
  else if (version === 7) durationMs = fileLength / 10
  else if (version === 8) durationMs = Math.max(0, fileLength - 44) / 32
  else if (version === 9) durationMs = Math.max(0, fileLength - 44) / 64
  else if (/^\d{14}REC\d+\.wav$/i.test(filename)) durationMs = fileLength / 32
  else if (
    /^(\d{2})?(\d{2})(\w{3})(\d{2})-\d{6}-.*\.(hda|wav)$/i.test(filename)
  ) {
    durationMs = fileLength / 8
  }
  return Math.floor(durationMs / 1000)
}

export function parseDeviceInfoBody(
  body: Uint8Array,
  model: string,
): DeviceInfo {
  const minimumLength = model === "hidock-p1:mini" ? 5 : 20
  if (body.length < minimumLength) {
    throw new Error("Device-info response must contain at least 20 bytes")
  }
  const versionNumber = readUint32BE(body)
  const firmwareVersion = `${body[1]}.${body[2]}.${body[3]}`
  const serial = new TextDecoder("ascii")
    .decode(body.slice(4, 20))
    .replace(/\0/g, "")
    .trim()
  return {
    connected: true,
    identified: true,
    model,
    firmwareVersion,
    versionNumber,
    serial,
  }
}

export function parseSettings(body: Uint8Array): DeviceSettings {
  if (body.length < 16) {
    throw new Error("Settings response must contain at least 16 bytes")
  }
  return {
    autoRecord: body[3] === 1,
    autoPlay: body[7] === 1,
    notificationSound: body[11] === 1,
    bluetoothTone: body[15] !== 1,
    recordOnVibe: body.length >= 20 ? body[19] === 1 : undefined,
  }
}

function decodeCompleteUtf8(bytes: Uint8Array): string {
  const nullIndex = bytes.findIndex((byte) => byte === 0)
  const withoutNulls = bytes.slice(0, nullIndex < 0 ? bytes.length : nullIndex)
  const decoder = new TextDecoder("utf-8", { fatal: true })
  for (let end = withoutNulls.length; end >= 0; end -= 1) {
    try {
      return decoder.decode(withoutNulls.slice(0, end))
    } catch {
      // Try again without the incomplete trailing code point.
    }
  }
  return ""
}

export function parseBluetoothMac(mac: string): number[] {
  if (!/^[0-9a-f]{2}(?:-[0-9a-f]{2}){5}$/i.test(mac)) {
    throw new Error("Bluetooth MAC must use AA-BB-CC-DD-EE-FF format")
  }
  return mac.split("-").map((part) => Number.parseInt(part, 16))
}

export function parseBluetoothDevices(body: Uint8Array): BluetoothDeviceInfo[] {
  if (body.length < 2) return []
  const count = (body[0] << 8) | body[1]
  const devices: BluetoothDeviceInfo[] = []
  let offset = 2

  for (let index = 0; index < count && offset + 2 <= body.length; index += 1) {
    const nameLength = (body[offset] << 8) | body[offset + 1]
    offset += 2
    if (offset + nameLength + 6 > body.length) break
    const name = decodeCompleteUtf8(body.slice(offset, offset + nameLength))
    offset += nameLength
    const mac = Array.from(body.slice(offset, offset + 6))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join("-")
    offset += 6
    if (nameLength > 0) devices.push({ name, mac, audio: true })
  }
  return devices
}

export function parsePairedBluetoothDevices(
  body: Uint8Array,
): BluetoothDeviceInfo[] {
  if (body.length < 2) return []
  const count = (body[0] << 8) | body[1]
  const devices: BluetoothDeviceInfo[] = []
  let offset = 2

  for (let index = 0; index < count && offset + 2 <= body.length; index += 1) {
    const nameLength = (body[offset] << 8) | body[offset + 1]
    offset += 2
    if (offset + nameLength + 7 > body.length) break
    const name = decodeCompleteUtf8(body.slice(offset, offset + nameLength))
    offset += nameLength
    const mac = Array.from(body.slice(offset, offset + 6))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join("-")
    offset += 6
    const sequence = body[offset]
    offset += 1
    if (name && name !== "UUUUUUUUUUUUUUUUUUUUUUUUUUUUU") {
      devices.push({ name, mac, sequence })
    }
  }
  return devices
}

export function parseBluetoothStatus(body: Uint8Array): BluetoothStatus {
  const disconnected = (
    status: BluetoothStatus["status"],
  ): BluetoothStatus => ({
    status,
    connected: false,
    mac: "",
    a2dp: false,
    hfp: false,
    avrcp: false,
    battery: 0,
  })
  if (body.length === 0 || body[0] === 1) return disconnected("disconnected")
  if (body[0] === 2) return disconnected("scanning")
  if (body[0] === 3) return disconnected("connecting")
  if (body.length < 3) throw new Error("Bluetooth-status response is truncated")

  const nameLength = (body[1] << 8) | body[2]
  const macOffset = 3 + nameLength
  if (body.length < macOffset + 10) {
    throw new Error("Bluetooth-status response is truncated")
  }
  const name = decodeCompleteUtf8(body.slice(3, macOffset))
  const mac = Array.from(body.slice(macOffset, macOffset + 6))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join("-")
  return {
    status: "connected",
    connected: true,
    name,
    mac,
    a2dp: body[macOffset + 6] === 1,
    hfp: body[macOffset + 7] === 1,
    avrcp: body[macOffset + 8] === 1,
    battery: Math.floor((body[macOffset + 9] / 255) * 100),
  }
}

function monthNumber(month: string): string | null {
  const index = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(month.toLowerCase())
  return index < 0 ? null : String(index + 1).padStart(2, "0")
}

function validDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return false
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function parseHiDockFilenameDate(name: string): string {
  let parts: [number, number, number, number, number, number] | null = null
  if (/^\d{14}/.test(name)) {
    const value = name.slice(0, 14)
    parts = [
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)),
      Number(value.slice(6, 8)),
      Number(value.slice(8, 10)),
      Number(value.slice(10, 12)),
      Number(value.slice(12, 14)),
    ]
  } else {
    const match = name.match(
      /^(\d{2})?(\d{2})([A-Za-z]{3})(\d{2})-(\d{2})(\d{2})(\d{2})-.*\.(hda|wav)$/,
    )
    const month = match ? monthNumber(match[3]) : null
    if (match && month) {
      parts = [
        2000 + Number(match[2]),
        Number(month),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
        Number(match[7]),
      ]
    }
  }
  if (!parts || !validDateParts(...parts)) return "-"
  const [year, month, day, hour, minute, second] = parts
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`
}

function recordingMode(filename: string): HiDockFile["mode"] {
  const mode = filename
    .replace(/^(\w{9})-(\d{6})-(.+?)\d+\.\w+$/i, "$3")
    .toUpperCase()
  if (mode === "WHSP" || mode === "WIP") return "whisper"
  if (mode === "CALL") return "call"
  return "room"
}

export function parseFileListPayload(bytes: Uint8Array): {
  files: HiDockFile[]
  expected: number | null
  complete: boolean
  consumedBytes: number
} {
  let offset = 0
  let expected: number | null = null
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xff) {
    if (bytes.length < 6)
      return { files: [], expected: null, complete: false, consumedBytes: 0 }
    expected = readUint32BE(bytes, 2)
    offset = 6
  }

  const files: HiDockFile[] = []
  const signatures = new Set<string>()
  let consumedBytes = offset
  while (offset < bytes.length) {
    const entryStart = offset
    if (offset + 4 > bytes.length) break
    const version = bytes[offset]
    const nameLength =
      (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
    offset += 4
    if (offset + nameLength + 26 > bytes.length) {
      offset = entryStart
      break
    }
    const filename = new TextDecoder("ascii")
      .decode(bytes.slice(offset, offset + nameLength))
      .replace(/\0+$/g, "")
    offset += nameLength
    const fileLength = readUint32BE(bytes, offset)
    offset += 10
    const signature = Array.from(bytes.slice(offset, offset + 16))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    offset += 16
    consumedBytes = offset
    if (!filename || signatures.has(signature)) continue
    signatures.add(signature)
    const durationSec = estimateHiDockDurationSec(fileLength, version, filename)
    files.push({
      filename,
      fileLength,
      createdAtRaw: parseHiDockFilenameDate(filename),
      durationSec,
      durationLabel: formatDuration(durationSec),
      mode: recordingMode(filename),
      version,
      signature,
    })
  }
  return {
    files,
    expected,
    complete: expected != null && files.length >= expected,
    consumedBytes,
  }
}

export function parseRecordingStatus(body: Uint8Array): RecordingStatus {
  if (body.length === 0)
    return { recording: null, duration: 0, samples: [], type: null }
  if (body.length < 2) throw new Error("Recording-status response is truncated")
  const typeCode = body[0]
  const nameLength = body[1]
  const durationOffset = 2 + nameLength
  if (body.length < durationOffset + 3)
    throw new Error("Recording-status response is truncated")
  const sampleCount = body[durationOffset + 2]
  if (body.length < durationOffset + 3 + sampleCount) {
    throw new Error("Recording-status response is truncated")
  }
  const recording = new TextDecoder("ascii")
    .decode(body.slice(2, durationOffset))
    .replace(/\0+$/g, "")
  return {
    recording: recording || null,
    duration: (body[durationOffset] << 8) | body[durationOffset + 1],
    samples: Array.from(
      body.slice(durationOffset + 3, durationOffset + 3 + sampleCount),
    ),
    type: typeCode === 0 ? "recording" : "whisper",
  }
}

export function parseRealtimeStatus(body: Uint8Array): RealtimeStatus {
  if (body.length < 8)
    throw new Error("Realtime response must contain at least 8 bytes")
  return {
    rest: readUint32BE(body),
    muted: readUint32BE(body, 4) === 1,
    dataLength: body.length,
    audioData: body.slice(8),
  }
}

export function decodeRealtimePcm16(audio: Uint8Array): {
  left: Float32Array
  right: Float32Array
  rmsLeft: number
  rmsRight: number
} {
  const frameCount = Math.floor(audio.length / 4)
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  let leftSquares = 0
  let rightSquares = 0

  for (let index = 0; index < frameCount; index += 1) {
    const offset = index * 4
    const leftSample = view.getInt16(offset, true) / 32768
    const rightSample = view.getInt16(offset + 2, true) / 32768
    left[index] = leftSample
    right[index] = rightSample
    leftSquares += leftSample * leftSample
    rightSquares += rightSample * rightSample
  }

  return {
    left,
    right,
    rmsLeft: frameCount === 0 ? 0 : Math.sqrt(leftSquares / frameCount),
    rmsRight: frameCount === 0 ? 0 : Math.sqrt(rightSquares / frameCount),
  }
}

export type RealtimeNoiseState = {
  noiseFloor: number
  previousInput: number
  previousOutput: number
}

export function suppressRealtimeNoise(
  left: Float32Array,
  right: Float32Array,
  initialState: RealtimeNoiseState,
): { mono: Float32Array; rms: number; state: RealtimeNoiseState } {
  const length = Math.min(left.length, right.length)
  const mono = new Float32Array(length)
  let noiseFloor = Math.max(0.001, initialState.noiseFloor)
  let previousInput = initialState.previousInput
  let previousOutput = initialState.previousOutput
  let squares = 0

  for (let index = 0; index < length; index += 1) {
    const input =
      Math.abs(left[index]) >= Math.abs(right[index])
        ? left[index]
        : right[index]
    const highPassed = 0.995 * (previousOutput + input - previousInput)
    previousInput = input
    previousOutput = highPassed
    const magnitude = Math.abs(highPassed)

    if (magnitude < 0.08) {
      noiseFloor = noiseFloor * 0.995 + magnitude * 0.005
    }
    const gate = Math.max(0.012, noiseFloor * 2.2)
    const output =
      magnitude <= gate
        ? 0
        : Math.sign(highPassed) * Math.min(1, magnitude - gate)
    mono[index] = output
    squares += output * output
  }

  return {
    mono,
    rms: length === 0 ? 0 : Math.sqrt(squares / length),
    state: { noiseFloor, previousInput, previousOutput },
  }
}

export function encodeMonoPcm16Wav(
  chunks: Float32Array[],
  sampleRate: number,
): Blob {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index)
    }
  }

  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, "data")
  view.setUint32(40, sampleCount * 2, true)

  let offset = 44
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(
        offset,
        clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767),
        true,
      )
      offset += 2
    }
  }

  return new Blob([bytes], { type: "audio/wav" })
}
