import { describe, expect, it } from "vitest";
import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
} from "@wllama/wllama";
import {
  ComparisonRuntime,
  type Engine,
  type CompletionParams,
} from "./runtime";
import type { Event } from "./protocol";

const decision = {
  state: "Locked out",
  question: "Queue?",
  options: ["Account", "Billing"],
};
function completion(count: number): ChatCompletionResponse {
  return {
    id: "fixture",
    object: "chat.completion",
    created: 0,
    model: "fixture",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "A" },
        finish_reason: "stop",
        logprobs: {
          refusal: null,
          content: [
            {
              token: "A",
              bytes: [65],
              logprob: 0,
              top_logprobs: Array.from({ length: count }, (_, i) => ({
                token: String.fromCharCode(65 + i),
                bytes: [65 + i],
                logprob: i === 0 ? Math.log(3) : 0,
              })),
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 42, completion_tokens: 1, total_tokens: 43 },
  };
}
class TestEngine implements Engine {
  failLoad = false;
  missingScores = false;
  exited = false;
  directFinished = false;
  async load() {
    if (this.failLoad) throw new Error("Network unavailable");
  }
  async complete(params: CompletionParams) {
    if (params.logprobs) {
      // Before-sampling top-20 responses can omit allowed letters entirely.
      if (
        !params.post_sampling_probs ||
        params.min_p !== 0 ||
        params.penalty_repeat !== 1
      )
        return completion(1);
      const count = Object.keys(params.logit_bias ?? {}).length;
      if (!Object.keys(params.logit_bias ?? {}).includes("54"))
        throw new Error("Wrong MiniCPM token mapping");
      if (this.missingScores) return completion(1);
      if (count === 2) this.directFinished = true;
      return completion(count);
    }
    return completion(1);
  }
  async stream(params: CompletionParams) {
    if (params.max_tokens === 512 && !this.directFinished)
      throw new Error("Generation started before direct scoring finished");
    const reportUsage = params.stream_options?.include_usage;
    const text =
      params.max_tokens === 512
        ? '{"A: Account":0.75,"B: Billing":0.25}'
        : "{}";
    return (async function* (): AsyncGenerator<ChatCompletionChunk> {
      yield {
        id: "fixture",
        object: "chat.completion.chunk",
        created: 0,
        model: "fixture",
        choices: [
          {
            index: 0,
            delta: { content: text },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: reportUsage
          ? { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 }
          : undefined,
      };
    })();
  }
  async exit() {
    this.exited = true;
  }
}

describe("comparison runtime", () => {
  it("warms the model, then publishes direct results before streamed JSON and completion", async () => {
    const events: Event[] = [];
    const runtime = new ComparisonRuntime(
      () => new TestEngine(),
      (event) => events.push(event),
    );
    await runtime.handle({ id: 1, type: "load", modelId: "minicpm5-2b" });
    expect(events.at(-1)?.type).toBe("ready");
    events.length = 0;
    await runtime.handle({ id: 2, type: "compare", decision });
    const outputs = events.filter((event) =>
      ["direct", "stream", "complete"].includes(event.type),
    );
    expect(outputs.map((event) => event.type)).toEqual([
      "direct",
      "stream",
      "complete",
    ]);
    const direct = outputs[0];
    expect(
      direct.type === "direct" && direct.result.options[0].probability,
    ).toBeCloseTo(0.75);
    const complete = outputs[2];
    expect(complete.type === "complete" && complete.result.valid).toBe(true);
    expect(complete.type === "complete" && complete.result.outputTokens).toBe(
      20,
    );
    expect(events.every((event) => event.id === 2)).toBe(true);
  });
  it("releases a failed model load and allows a fresh retry", async () => {
    const engines = [new TestEngine(), new TestEngine()];
    engines[0].failLoad = true;
    let index = 0;
    const events: Event[] = [];
    const runtime = new ComparisonRuntime(
      () => engines[index++],
      (event) => events.push(event),
    );
    await runtime.handle({ id: 1, type: "load", modelId: "minicpm5-2b" });
    expect(engines[0].exited).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "error", ready: false });
    await runtime.handle({ id: 2, type: "load", modelId: "minicpm5-2b" });
    expect(events.at(-1)?.type).toBe("ready");
  });
  it("rejects missing option logits during warmup instead of marking the model ready", async () => {
    const engine = new TestEngine();
    engine.missingScores = true;
    const events: Event[] = [];
    const runtime = new ComparisonRuntime(
      () => engine,
      (event) => events.push(event),
    );
    await runtime.handle({ id: 1, type: "load", modelId: "minicpm5-2b" });
    expect(events.at(-1)).toMatchObject({ type: "error", ready: false });
    expect(engine.exited).toBe(true);
  });
  it("rejects a second request while the first model load is pending", async () => {
    let finish!: () => void;
    const engine = new TestEngine();
    engine.load = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const events: Event[] = [];
    const runtime = new ComparisonRuntime(
      () => engine,
      (event) => events.push(event),
    );
    const loading = runtime.handle({
      id: 1,
      type: "load",
      modelId: "minicpm5-2b",
    });
    await runtime.handle({ id: 2, type: "compare", decision });
    expect(events.at(-1)).toMatchObject({
      id: 2,
      type: "error",
      message: expect.stringMatching(/busy/i),
    });
    finish();
    await loading;
    expect(events.at(-1)).toMatchObject({ id: 1, type: "ready" });
  });
});
