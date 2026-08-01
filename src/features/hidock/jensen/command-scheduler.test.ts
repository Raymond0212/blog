import { describe, expect, it, vi } from "vitest"

import { JensenCommandScheduler } from "@/features/hidock/jensen/command-scheduler"

describe("Jensen command scheduler", () => {
  it("writes simultaneous commands sequentially", async () => {
    const writes: number[] = []
    const scheduler = new JensenCommandScheduler(async (frame) => {
      writes.push((frame[2] << 8) | frame[3])
    }, 100)

    const first = scheduler.send(1)
    const second = scheduler.send(2)
    await vi.waitFor(() => expect(writes).toEqual([1]))

    scheduler.accept({
      command: 1,
      sequence: 100,
      body: new Uint8Array([1]),
      paddingLength: 0,
    })
    await expect(first).resolves.toMatchObject({ command: 1, sequence: 100 })
    await vi.waitFor(() => expect(writes).toEqual([1, 2]))

    scheduler.accept({
      command: 2,
      sequence: 101,
      body: new Uint8Array([2]),
      paddingLength: 0,
    })
    await expect(second).resolves.toMatchObject({ command: 2, sequence: 101 })
  })

  it("advances the queue after a timeout", async () => {
    vi.useFakeTimers()
    const writes: number[] = []
    const scheduler = new JensenCommandScheduler(async (frame) => {
      writes.push((frame[2] << 8) | frame[3])
    }, 1)

    const first = scheduler.send(1, new Uint8Array(), { timeoutMs: 10 })
    const firstResult = expect(first).rejects.toThrow("timed out")
    const second = scheduler.send(2, new Uint8Array(), { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(10)

    await firstResult
    expect(writes).toEqual([1, 2])
    scheduler.accept({
      command: 2,
      sequence: 2,
      body: new Uint8Array(),
      paddingLength: 0,
    })
    await expect(second).resolves.toMatchObject({ command: 2 })
    vi.useRealTimers()
  })

  it("never overlaps USB writes when a transferOut call is still pending", async () => {
    vi.useFakeTimers()
    const writes: number[] = []
    let releaseFirstWrite: (() => void) | undefined
    const scheduler = new JensenCommandScheduler(async (frame) => {
      const command = (frame[2] << 8) | frame[3]
      writes.push(command)
      if (command === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve
        })
      }
    }, 1)

    const first = scheduler.send(1, new Uint8Array(), { timeoutMs: 10 })
    const firstResult = expect(first).rejects.toThrow("timed out")
    const second = scheduler.send(2, new Uint8Array(), { timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(20)
    expect(writes).toEqual([1])

    releaseFirstWrite?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10)
    await firstResult
    expect(writes).toEqual([1, 2])
    scheduler.accept({
      command: 2,
      sequence: 2,
      body: new Uint8Array(),
      paddingLength: 0,
    })
    await second
    vi.useRealTimers()
  })

  it("waits for transferOut completion even if a response arrives unusually early", async () => {
    const writes: number[] = []
    let releaseFirstWrite: (() => void) | undefined
    const scheduler = new JensenCommandScheduler(async (frame) => {
      const command = (frame[2] << 8) | frame[3]
      writes.push(command)
      if (command === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve
        })
      }
    }, 1)
    const first = scheduler.send(1)
    const second = scheduler.send(2)

    scheduler.accept({
      command: 1,
      sequence: 1,
      body: new Uint8Array(),
      paddingLength: 0,
    })
    await first
    expect(writes).toEqual([1])

    releaseFirstWrite?.()
    await vi.waitFor(() => expect(writes).toEqual([1, 2]))
    scheduler.accept({
      command: 2,
      sequence: 2,
      body: new Uint8Array(),
      paddingLength: 0,
    })
    await second
  })

  it("does not let a late response resolve a newer command", async () => {
    vi.useFakeTimers()
    const scheduler = new JensenCommandScheduler(async () => undefined, 10)
    const first = scheduler.send(4, new Uint8Array(), { timeoutMs: 10 })
    const firstResult = expect(first).rejects.toThrow("timed out")
    const second = scheduler.send(4, new Uint8Array(), { timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(10)
    await firstResult

    expect(
      scheduler.accept({
        command: 4,
        sequence: 10,
        body: new Uint8Array([9]),
        paddingLength: 0,
      }),
    ).toBe(false)
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })
    await Promise.resolve()
    expect(secondSettled).toBe(false)

    scheduler.accept({
      command: 4,
      sequence: 11,
      body: new Uint8Array([1]),
      paddingLength: 0,
    })
    await expect(second).resolves.toMatchObject({ sequence: 11 })
    vi.useRealTimers()
  })

  it("keeps a streamed command active until its response policy completes", async () => {
    const writes: number[] = []
    const scheduler = new JensenCommandScheduler(async (frame) => {
      writes.push((frame[2] << 8) | frame[3])
    }, 20)
    const chunks: number[] = []
    const stream = scheduler.send(5, new Uint8Array(), {
      acceptCommandStream: true,
      responsePolicy: (message) => {
        chunks.push(...message.body)
        return chunks.length >= 3
          ? { done: true, value: chunks }
          : { done: false }
      },
    })
    const next = scheduler.send(6)
    await vi.waitFor(() => expect(writes).toEqual([5]))

    scheduler.accept({
      command: 5,
      sequence: 20,
      body: new Uint8Array([1]),
      paddingLength: 0,
    })
    scheduler.accept({
      command: 5,
      sequence: 999,
      body: new Uint8Array([2, 3]),
      paddingLength: 0,
    })
    await expect(stream).resolves.toEqual([1, 2, 3])
    await vi.waitFor(() => expect(writes).toEqual([5, 6]))

    scheduler.accept({
      command: 6,
      sequence: 21,
      body: new Uint8Array(),
      paddingLength: 0,
    })
    await next
  })

  it("requires the echoed sequence before accepting later streamed frames", async () => {
    const scheduler = new JensenCommandScheduler(async () => undefined, 50)
    const values: number[] = []
    const stream = scheduler.send(5, new Uint8Array(), {
      acceptCommandStream: true,
      responsePolicy: (message) => {
        values.push(...message.body)
        return values.length === 2
          ? { done: true, value: values }
          : { done: false }
      },
    })

    expect(
      scheduler.accept({
        command: 5,
        sequence: 49,
        body: new Uint8Array([9]),
        paddingLength: 0,
      }),
    ).toBe(false)
    scheduler.accept({
      command: 5,
      sequence: 50,
      body: new Uint8Array([1]),
      paddingLength: 0,
    })
    scheduler.accept({
      command: 5,
      sequence: 900,
      body: new Uint8Array([2]),
      paddingLength: 0,
    })

    await expect(stream).resolves.toEqual([1, 2])
  })
})
