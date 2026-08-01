import {
  JENSEN_HEADER_SIZE,
  JENSEN_MAGIC,
  JENSEN_MAX_PAYLOAD_SIZE,
  JENSEN_MAX_RECEIVE_BUFFER_SIZE,
} from "@/features/hidock/jensen/constants"

export type JensenMessage = {
  command: number
  sequence: number
  body: Uint8Array
  paddingLength: number
}

type DecoderOptions = {
  maxPayloadBytes?: number
  maxBufferBytes?: number
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>>
    0
  )
}

function concatBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  if (left.length === 0) return new Uint8Array(right)
  if (right.length === 0) return new Uint8Array(left)
  const joined = new Uint8Array(left.length + right.length)
  joined.set(left)
  joined.set(right, left.length)
  return joined
}

export function encodeJensenFrame(
  command: number,
  sequence: number,
  body: Uint8Array<ArrayBufferLike> = new Uint8Array(),
): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(command) || command < 0 || command > 0xffff) {
    throw new RangeError(`Invalid Jensen command: ${command}`)
  }
  if (body.length > 0x00ff_ffff) {
    throw new RangeError("Jensen command body exceeds the 24-bit payload range")
  }

  const frame = new Uint8Array(JENSEN_HEADER_SIZE + body.length)
  frame[0] = JENSEN_MAGIC[0]
  frame[1] = JENSEN_MAGIC[1]
  frame[2] = (command >>> 8) & 0xff
  frame[3] = command & 0xff
  frame[4] = (sequence >>> 24) & 0xff
  frame[5] = (sequence >>> 16) & 0xff
  frame[6] = (sequence >>> 8) & 0xff
  frame[7] = sequence & 0xff
  frame[8] = 0
  frame[9] = (body.length >>> 16) & 0xff
  frame[10] = (body.length >>> 8) & 0xff
  frame[11] = body.length & 0xff
  frame.set(body, JENSEN_HEADER_SIZE)
  return frame
}

export class JensenFrameDecoder {
  private buffer = new Uint8Array()
  private readonly maxPayloadBytes: number
  private readonly maxBufferBytes: number
  droppedBytes = 0

  constructor(options: DecoderOptions = {}) {
    this.maxPayloadBytes = options.maxPayloadBytes ?? JENSEN_MAX_PAYLOAD_SIZE
    this.maxBufferBytes =
      options.maxBufferBytes ?? JENSEN_MAX_RECEIVE_BUFFER_SIZE
  }

  get bufferedBytes(): number {
    return this.buffer.length
  }

  reset(): void {
    this.buffer = new Uint8Array()
  }

  push(chunk: Uint8Array<ArrayBufferLike>): JensenMessage[] {
    this.buffer = concatBytes(this.buffer, chunk)
    if (this.buffer.length > this.maxBufferBytes) {
      this.reset()
      throw new Error(
        `Jensen receive buffer exceeded ${this.maxBufferBytes} bytes`,
      )
    }
    const messages: JensenMessage[] = []
    let offset = 0

    while (offset + JENSEN_HEADER_SIZE <= this.buffer.length) {
      if (
        this.buffer[offset] !== JENSEN_MAGIC[0] ||
        this.buffer[offset + 1] !== JENSEN_MAGIC[1]
      ) {
        offset += 1
        this.droppedBytes += 1
        continue
      }

      const rawLength = readUint32BE(this.buffer, offset + 8)
      const paddingLength = rawLength >>> 24
      const payloadLength = rawLength & 0x00ff_ffff
      const frameLength = JENSEN_HEADER_SIZE + payloadLength + paddingLength

      if (
        payloadLength > this.maxPayloadBytes ||
        frameLength > this.maxBufferBytes
      ) {
        offset += 1
        this.droppedBytes += 1
        continue
      }
      if (this.buffer.length - offset < frameLength) break

      const command = (this.buffer[offset + 2] << 8) | this.buffer[offset + 3]
      const sequence = readUint32BE(this.buffer, offset + 4)
      const bodyStart = offset + JENSEN_HEADER_SIZE
      messages.push({
        command,
        sequence,
        body: this.buffer.slice(bodyStart, bodyStart + payloadLength),
        paddingLength,
      })
      offset += frameLength
    }

    if (offset > 0) this.buffer = this.buffer.slice(offset)

    return messages
  }
}
