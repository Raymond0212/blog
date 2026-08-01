import {
  encodeJensenFrame,
  type JensenMessage,
} from "@/features/hidock/jensen/frame-codec"

export type ResponsePolicyResult<T> = { done: false } | { done: true; value: T }
export type ResponsePolicy<T> = (
  message: JensenMessage,
) => ResponsePolicyResult<T>

export type SendOptions<T> = {
  timeoutMs?: number
  streamIdleTimeoutMs?: number
  acceptCommandStream?: boolean
  responsePolicy?: ResponsePolicy<T>
}

type QueuedCommand<T> = {
  command: number
  body: Uint8Array
  options: SendOptions<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

type ActiveCommand<T> = QueuedCommand<T> & {
  sequence: number
  timeout: ReturnType<typeof setTimeout>
  settled: boolean
  streamStarted: boolean
}

export class JensenCommandScheduler {
  private queue: QueuedCommand<unknown>[] = []
  private active: ActiveCommand<unknown> | null = null
  private sequence: number
  private stopped = false
  private writing = false

  constructor(
    private readonly write: (frame: Uint8Array<ArrayBuffer>) => Promise<void>,
    initialSequence = 0,
  ) {
    this.sequence = initialSequence >>> 0
  }

  get isBusy(): boolean {
    return this.active != null
  }

  get queuedCount(): number {
    return this.queue.length
  }

  send<T = JensenMessage>(
    command: number,
    body = new Uint8Array(),
    options: SendOptions<T> = {},
  ): Promise<T> {
    if (this.stopped)
      return Promise.reject(new Error("Jensen scheduler is stopped"))

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        command,
        body: body.slice(),
        options,
        resolve,
        reject,
      } as QueuedCommand<unknown>)
      void this.pump()
    })
  }

  accept(message: JensenMessage): boolean {
    const active = this.active
    if (!active || active.command !== message.command) return false
    if (
      active.sequence !== message.sequence &&
      (!active.options.acceptCommandStream || !active.streamStarted)
    ) {
      return false
    }
    active.streamStarted = true

    const policy = active.options.responsePolicy as
      | ResponsePolicy<unknown>
      | undefined
    const result = policy
      ? policy(message)
      : { done: true as const, value: message }
    if (!result.done) {
      this.armTimeout(active, true)
      return true
    }

    this.finish(active, () => active.resolve(result.value))
    return true
  }

  cancelAll(reason = new Error("Jensen command cancelled")): void {
    if (this.active) {
      const active = this.active
      this.finish(active, () => active.reject(reason), false)
    }
    const queued = this.queue.splice(0)
    for (const command of queued) command.reject(reason)
  }

  stop(reason = new Error("Jensen scheduler stopped")): void {
    this.stopped = true
    this.cancelAll(reason)
  }

  resume(): void {
    this.stopped = false
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.writing || this.active || this.queue.length === 0)
      return
    const queued = this.queue.shift()
    if (!queued) return

    const sequence = this.sequence
    this.sequence = (this.sequence + 1) >>> 0
    const active: ActiveCommand<unknown> = {
      ...queued,
      sequence,
      settled: false,
      streamStarted: false,
      timeout: setTimeout(() => undefined, 0),
    }
    clearTimeout(active.timeout)
    this.active = active
    this.writing = true

    try {
      await this.write(encodeJensenFrame(active.command, sequence, active.body))
      if (this.active === active && !active.settled) this.armTimeout(active)
    } catch (error) {
      this.finish(active, () =>
        active.reject(
          error instanceof Error ? error : new Error(String(error)),
        ),
      )
    } finally {
      this.writing = false
      void this.pump()
    }
  }

  private armTimeout(active: ActiveCommand<unknown>, streamed = false): void {
    clearTimeout(active.timeout)
    const timeoutMs =
      (streamed ? active.options.streamIdleTimeoutMs : undefined) ??
      active.options.timeoutMs ??
      8000
    active.timeout = setTimeout(() => {
      this.finish(active, () =>
        active.reject(new Error(`Jensen command ${active.command} timed out`)),
      )
    }, timeoutMs)
  }

  private finish(
    active: ActiveCommand<unknown>,
    settle: () => void,
    advance = true,
  ): void {
    if (active.settled || this.active !== active) return
    active.settled = true
    clearTimeout(active.timeout)
    this.active = null
    settle()
    if (advance) void this.pump()
  }
}
