import { describe, expect, it } from "vitest"

import * as parsers from "@/features/hidock/jensen/parsers"

import {
  estimateHiDockDurationSec,
  parseBluetoothDevices,
  parseBluetoothStatus,
  parseBcdDeviceTime,
  parsePairedBluetoothDevices,
  parseDeviceInfoBody,
  parseFileListPayload,
  parseBluetoothMac,
  parseRecordingStatus,
  parseRealtimeStatus,
  parseSettings,
} from "@/features/hidock/jensen/parsers"

describe("Jensen response parsers", () => {
  it("converts Jensen BCD device time and recognizes an unset clock", () => {
    expect(
      parseBcdDeviceTime(
        new Uint8Array([0x20, 0x26, 0x07, 0x26, 0x22, 0x45, 0x19]),
      ),
    ).toBe("2026-07-26 22:45:19")
    expect(parseBcdDeviceTime(new Uint8Array(7))).toBe("unknown")
    expect(() => parseBcdDeviceTime(new Uint8Array(6))).toThrow(
      "Device-time response must contain 7 BCD bytes",
    )
  })

  it.each([
    [1, 160_000, 10],
    [2, 960_044, 10],
    [3, 1_920_044, 10],
    [5, 120_000, 10],
    [6, 160_000, 10],
    [7, 100_000, 10],
    [8, 320_044, 10],
    [9, 640_044, 10],
  ])(
    "converts the HiNotes millisecond duration formula for file version %i to seconds",
    (version, bytes, seconds) => {
      expect(estimateHiDockDurationSec(bytes, version, "unknown.bin")).toBe(
        seconds,
      )
    },
  )

  it("converts a physical P1 Mini version-8 WAV file duration to seconds", () => {
    expect(
      estimateHiDockDurationSec(286_520, 8, "2026Jul29-111519-Rec34.wav"),
    ).toBe(8)
  })

  it("requires a complete device-info response and preserves the full version number", () => {
    expect(() => parseDeviceInfoBody(new Uint8Array(19), "hidock-h1")).toThrow(
      "Device-info response must contain at least 20 bytes",
    )
    expect(
      parseDeviceInfoBody(
        new Uint8Array([
          0,
          5,
          0,
          9,
          ...Array.from(
            new TextEncoder().encode("SERIAL-123"),
            (value) => value,
          ),
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ]),
        "hidock-h1e",
      ),
    ).toEqual({
      connected: true,
      identified: true,
      model: "hidock-h1e",
      firmwareVersion: "5.0.9",
      versionNumber: 327689,
      serial: "SERIAL-123",
    })
  })

  it("accepts the P1 Mini device-info response when its serial omits null padding", () => {
    expect(
      parseDeviceInfoBody(
        new Uint8Array([
          0,
          2,
          3,
          1,
          ...new TextEncoder().encode("HDPM253804017"),
        ]),
        "hidock-p1:mini",
      ),
    ).toEqual({
      connected: true,
      identified: true,
      model: "hidock-p1:mini",
      firmwareVersion: "2.3.1",
      versionNumber: 131841,
      serial: "HDPM253804017",
    })
  })

  it("validates settings offsets and reads record-on-vibration", () => {
    expect(() => parseSettings(new Uint8Array(15))).toThrow(
      "Settings response must contain at least 16 bytes",
    )
    const body = new Uint8Array(20)
    body[3] = 1
    body[7] = 2
    body[11] = 1
    body[15] = 2
    body[19] = 1
    expect(parseSettings(body)).toEqual({
      autoRecord: true,
      autoPlay: false,
      notificationSound: true,
      bluetoothTone: true,
      recordOnVibe: true,
    })
  })

  it("truncates an incomplete trailing UTF-8 name and skips zero-length records", () => {
    const body = new Uint8Array([
      0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0x41, 0xe2, 0x82, 0, 1, 2, 3, 4, 5, 6,
    ])
    expect(parseBluetoothDevices(body)).toEqual([
      {
        name: "A",
        mac: "01-02-03-04-05-06",
        audio: true,
      },
    ])
  })

  it("parses paired Bluetooth records with their sequence byte", () => {
    const name = Array.from(new TextEncoder().encode("Headset"))
    const body = new Uint8Array([
      0,
      1,
      0,
      name.length,
      ...name,
      10,
      11,
      12,
      13,
      14,
      15,
      7,
    ])
    expect(parsePairedBluetoothDevices(body)).toEqual([
      {
        name: "Headset",
        mac: "0A-0B-0C-0D-0E-0F",
        sequence: 7,
      },
    ])
  })

  it("parses the Jensen Bluetooth status prefix, UTF-8 name, and profile flags", () => {
    const body = new Uint8Array([
      0, 0, 4, 0x41, 0xe2, 0x82, 0, 1, 2, 3, 4, 5, 6, 1, 0, 1, 128,
    ])
    expect(parseBluetoothStatus(body)).toEqual({
      status: "connected",
      connected: true,
      name: "A",
      mac: "01-02-03-04-05-06",
      a2dp: true,
      hfp: false,
      avrcp: true,
      battery: 50,
    })
    expect(parseBluetoothStatus(new Uint8Array([2]))).toEqual({
      status: "scanning",
      connected: false,
      mac: "",
      a2dp: false,
      hfp: false,
      avrcp: false,
      battery: 0,
    })
  })

  it("rejects malformed Bluetooth MAC bytes instead of partially parsing them", () => {
    expect(parseBluetoothMac("AA-BB-CC-DD-EE-FF")).toEqual([
      170, 187, 204, 221, 238, 255,
    ])
    expect(() => parseBluetoothMac("0G-BB-CC-DD-EE-FF")).toThrow(
      "Bluetooth MAC must use AA-BB-CC-DD-EE-FF format",
    )
  })

  it("keeps incomplete file-list records buffered until the next chunk", () => {
    const name = Array.from(new TextEncoder().encode("20260726123456REC1.wav"))
    const entry = new Uint8Array([
      8,
      0,
      0,
      name.length,
      ...name,
      0,
      0,
      1,
      108,
      0,
      0,
      0,
      0,
      0,
      0,
      ...Array.from({ length: 16 }, (_, index) => index),
    ])
    const payload = new Uint8Array([0xff, 0xff, 0, 0, 0, 1, ...entry])

    for (let split = 1; split < payload.length; split += 1) {
      const partial = parseFileListPayload(payload.slice(0, split))
      expect(partial.files).toHaveLength(0)
      expect(parseFileListPayload(payload).files).toHaveLength(1)
    }
    expect(parseFileListPayload(payload)).toMatchObject({
      expected: 1,
      complete: true,
    })
  })

  it("rejects truncated recording and realtime responses", () => {
    expect(() => parseRecordingStatus(new Uint8Array([0, 4, 65]))).toThrow(
      "Recording-status response is truncated",
    )
    expect(() => parseRealtimeStatus(new Uint8Array(7))).toThrow(
      "Realtime response must contain at least 8 bytes",
    )
    expect(
      parseRealtimeStatus(new Uint8Array([0, 0, 0, 7, 0, 0, 0, 1, 9])),
    ).toEqual({
      rest: 7,
      muted: true,
      dataLength: 9,
      audioData: new Uint8Array([9]),
    })
  })

  it("decodes interleaved realtime PCM into stereo samples and RMS levels", () => {
    const decodeRealtimePcm16 = (
      parsers as typeof parsers & {
        decodeRealtimePcm16?: (audio: Uint8Array) => {
          left: Float32Array
          right: Float32Array
          rmsLeft: number
          rmsRight: number
        }
      }
    ).decodeRealtimePcm16

    expect(typeof decodeRealtimePcm16).toBe("function")
    if (!decodeRealtimePcm16) return

    const decoded = decodeRealtimePcm16(
      new Uint8Array([0x00, 0x40, 0x00, 0xc0, 0x00, 0x20, 0x00, 0xe0]),
    )

    expect(Array.from(decoded.left)).toEqual([0.5, 0.25])
    expect(Array.from(decoded.right)).toEqual([-0.5, -0.25])
    expect(decoded.rmsLeft).toBeCloseTo(0.3953, 4)
    expect(decoded.rmsRight).toBeCloseTo(0.3953, 4)
  })

  it("merges device framing into one noise-suppressed monitor channel", () => {
    const suppressRealtimeNoise = (
      parsers as typeof parsers & {
        suppressRealtimeNoise?: (
          left: Float32Array,
          right: Float32Array,
          state: {
            noiseFloor: number
            previousInput: number
            previousOutput: number
          },
        ) => {
          mono: Float32Array
          rms: number
          state: {
            noiseFloor: number
            previousInput: number
            previousOutput: number
          }
        }
      }
    ).suppressRealtimeNoise

    expect(typeof suppressRealtimeNoise).toBe("function")
    if (!suppressRealtimeNoise) return

    const processed = suppressRealtimeNoise(
      new Float32Array([0.002, 0.45, -0.45]),
      new Float32Array([0.001, 0, 0]),
      { noiseFloor: 0.005, previousInput: 0, previousOutput: 0 },
    )

    expect(processed.mono[0]).toBe(0)
    expect(processed.mono[1]).toBeGreaterThan(0.2)
    expect(processed.mono[2]).toBeLessThan(-0.2)
    expect(processed.rms).toBeGreaterThan(0.2)
  })

  it("encodes captured monitor samples as a mono 16 kHz PCM WAV", async () => {
    const encodeMonoPcm16Wav = (
      parsers as typeof parsers & {
        encodeMonoPcm16Wav?: (
          chunks: Float32Array[],
          sampleRate: number,
        ) => Blob
      }
    ).encodeMonoPcm16Wav

    expect(typeof encodeMonoPcm16Wav).toBe("function")
    if (!encodeMonoPcm16Wav) return

    const wav = encodeMonoPcm16Wav([new Float32Array([-1, 0, 1])], 16_000)
    const bytes = new Uint8Array(await wav.arrayBuffer())
    const view = new DataView(bytes.buffer)

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF")
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE")
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(44, true)).toBe(-32_768)
    expect(view.getInt16(46, true)).toBe(0)
    expect(view.getInt16(48, true)).toBe(32_767)
  })
})
