import { describe, expect, it } from "vitest"

import {
  encodeJensenFrame,
  JensenFrameDecoder,
} from "@/features/hidock/jensen/frame-codec"

function responseFrame(
  command: number,
  sequence: number,
  body: number[],
  padding: number[] = [],
): Uint8Array {
  const payloadLength = body.length
  return new Uint8Array([
    0x12,
    0x34,
    (command >>> 8) & 0xff,
    command & 0xff,
    (sequence >>> 24) & 0xff,
    (sequence >>> 16) & 0xff,
    (sequence >>> 8) & 0xff,
    sequence & 0xff,
    padding.length,
    (payloadLength >>> 16) & 0xff,
    (payloadLength >>> 8) & 0xff,
    payloadLength & 0xff,
    ...body,
    ...padding,
  ])
}

describe("Jensen frame codec", () => {
  it("encodes the complete 12-byte header for an empty command", () => {
    expect(Array.from(encodeJensenFrame(0x1234, 0x01020304))).toEqual([
      0x12, 0x34, 0x12, 0x34, 0x01, 0x02, 0x03, 0x04, 0, 0, 0, 0,
    ])
  })

  it("encodes a non-empty command body after a big-endian length", () => {
    expect(
      Array.from(encodeJensenFrame(5, 9, new Uint8Array([0xaa, 0xbb]))),
    ).toEqual([0x12, 0x34, 0, 5, 0, 0, 0, 9, 0, 0, 0, 2, 0xaa, 0xbb])
  })

  it("decodes a padded frame without exposing padding in the body", () => {
    const decoder = new JensenFrameDecoder()
    const frames = decoder.push(responseFrame(4, 7, [1, 2, 3], [0xee, 0xee]))

    expect(frames).toEqual([
      {
        command: 4,
        sequence: 7,
        body: new Uint8Array([1, 2, 3]),
        paddingLength: 2,
      },
    ])
    expect(decoder.bufferedBytes).toBe(0)
  })

  it("preserves a padded frame across every USB chunk boundary", () => {
    const frame = responseFrame(34, 0x12345678, [8, 7, 6, 5], [0, 0, 0])

    for (let split = 1; split < frame.length; split += 1) {
      const decoder = new JensenFrameDecoder()
      expect(decoder.push(frame.slice(0, split))).toEqual([])
      expect(decoder.push(frame.slice(split))).toEqual([
        {
          command: 34,
          sequence: 0x12345678,
          body: new Uint8Array([8, 7, 6, 5]),
          paddingLength: 3,
        },
      ])
    }
  })

  it("decodes multiple responses from one USB read and retains an incomplete tail", () => {
    const first = responseFrame(1, 1, [10])
    const second = responseFrame(2, 2, [20, 21])
    const joined = new Uint8Array(first.length + second.length)
    joined.set(first)
    joined.set(second, first.length)
    const decoder = new JensenFrameDecoder()

    expect(decoder.push(joined.slice(0, joined.length - 1))).toHaveLength(1)
    expect(decoder.bufferedBytes).toBe(second.length - 1)
    expect(decoder.push(joined.slice(joined.length - 1))).toEqual([
      {
        command: 2,
        sequence: 2,
        body: new Uint8Array([20, 21]),
        paddingLength: 0,
      },
    ])
  })

  it("resynchronizes after junk and an impossible length instead of growing forever", () => {
    const impossible = new Uint8Array([
      0x12, 0x34, 0, 4, 0, 0, 0, 1, 0, 0x20, 0, 0,
    ])
    const valid = responseFrame(6, 2, [0, 0, 0, 3])
    const input = new Uint8Array(3 + impossible.length + valid.length)
    input.set([0xde, 0xad, 0xbe])
    input.set(impossible, 3)
    input.set(valid, 3 + impossible.length)
    const decoder = new JensenFrameDecoder({
      maxPayloadBytes: 1024,
      maxBufferBytes: 2048,
    })

    expect(decoder.push(input)).toEqual([
      {
        command: 6,
        sequence: 2,
        body: new Uint8Array([0, 0, 0, 3]),
        paddingLength: 0,
      },
    ])
    expect(decoder.bufferedBytes).toBe(0)
    expect(decoder.droppedBytes).toBe(15)
  })

  it("caps an incomplete aggregate receive buffer", () => {
    const decoder = new JensenFrameDecoder({
      maxPayloadBytes: 512,
      maxBufferBytes: 20,
    })
    const incomplete = responseFrame(
      4,
      1,
      Array.from({ length: 30 }, () => 1),
    ).slice(0, 20)

    expect(() => decoder.push(new Uint8Array([...incomplete, 1]))).toThrow(
      "Jensen receive buffer exceeded 20 bytes",
    )
    expect(decoder.bufferedBytes).toBe(0)
  })
})
