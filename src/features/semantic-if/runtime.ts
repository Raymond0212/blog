import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "@wllama/wllama";
import { MODELS, type ModelId } from "./models";
import type { Event, Request } from "./protocol";
import {
  buildMessages,
  labelFor,
  optionDistribution,
  type OptionScores,
  OUTPUT_TOKENS,
  validateDecision,
  validateGeneration,
  validatePromptBudget,
  type Decision,
} from "./decision";
// wllama 3.6.1 intersects its OpenAI bias map with a native bias-array type.
// The chat API accepts the OpenAI map (as used by the reference experiment).
export type CompletionParams = Omit<ChatCompletionParams, "logit_bias"> & {
  logit_bias?: Record<string, number>;
  post_sampling_probs?: boolean;
  stream_options?: { include_usage: boolean };
};
export interface Engine {
  load(
    modelId: ModelId,
    progress: (loaded: number, total: number) => void,
  ): Promise<void>;
  complete(params: CompletionParams): Promise<ChatCompletionResponse>;
  stream(params: CompletionParams): Promise<AsyncIterable<ChatCompletionChunk>>;
  exit(): Promise<void>;
}
export class ComparisonRuntime {
  private engine: Engine | null = null;
  private modelId: ModelId | null = null;
  private ready = false;
  private busy = false;
  constructor(
    private factory: () => Engine,
    private send: (event: Event) => void,
  ) {}

  private async score(decision: Decision) {
    if (!this.engine || !this.modelId) throw new Error("Load a model first.");
    const labels = decision.options.map((_, index) => labelFor(index));
    const started = performance.now();
    const response = await this.engine.complete({
      messages: buildMessages(decision, "direct"),
      max_tokens: 1,
      temperature: 1,
      top_k: 0,
      top_p: 1,
      min_p: 0,
      penalty_repeat: 1,
      post_sampling_probs: true,
      logprobs: true,
      top_logprobs: 20,
      logit_bias: Object.fromEntries(
        labels.map((_, index) => [
          String(MODELS[this.modelId!].labelBase + index),
          100,
        ]),
      ),
      grammar: `root ::= ${labels.map((label) => `"${label}"`).join(" | ")}`,
      cache_prompt: false,
      chat_template_kwargs: { enable_thinking: false },
    });
    // llama.cpp returns top_probs rather than top_logprobs when requesting
    // post-sampling scores. wllama's declarations currently omit this variant.
    const probabilities = optionDistribution(
      response.choices[0]?.logprobs?.content?.[0] as OptionScores | undefined,
      labels,
    );
    return {
      totalMs: performance.now() - started,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      options: decision.options.map((description, index) => ({
        label: labels[index],
        description,
        probability: probabilities[index],
      })),
    };
  }

  async handle(request: Request): Promise<void> {
    const { id } = request;
    if (this.busy) {
      this.send({
        id,
        type: "error",
        message: "The model is busy. Wait for the current operation.",
        ready: this.ready,
      });
      return;
    }
    this.busy = true;
    try {
      if (request.type === "load") {
        if (!Object.prototype.hasOwnProperty.call(MODELS, request.modelId))
          throw new Error("Choose one of the listed models.");
        if (this.engine) await this.engine.exit();
        this.ready = false;
        this.modelId = request.modelId;
        this.engine = this.factory();
        this.send({
          id,
          type: "phase",
          message: "Downloading the model or reading cached weights…",
        });
        const started = performance.now();
        await this.engine.load(request.modelId, (loaded, total) =>
          this.send({ id, type: "progress", loaded, total }),
        );
        this.send({ id, type: "loaded", loadMs: performance.now() - started });
        this.send({
          id,
          type: "phase",
          message: "Warming both methods and checking option scores…",
        });
        const warmupStart = performance.now();
        // Exercise all A–T tokens so an incompatible tokenizer fails before a user run.
        await this.score({
          state: "This is a model warmup.",
          question: "Select an option.",
          options: Array.from({ length: 20 }, (_, index) => labelFor(index)),
        });
        const warmup = await this.engine.stream({
          messages: [{ role: "user", content: 'Return JSON: {"ready":true}' }],
          max_tokens: 1,
          temperature: 0,
          cache_prompt: false,
          chat_template_kwargs: { enable_thinking: false },
        });
        for await (const chunk of warmup) {
          void chunk;
        }
        this.ready = true;
        this.send({
          id,
          type: "ready",
          warmupMs: performance.now() - warmupStart,
        });
      } else {
        if (!this.ready || !this.engine)
          throw new Error("Load a model before running a comparison.");
        const decision = validateDecision(request.decision);
        const messages = buildMessages(decision, "generation");
        validatePromptBudget(messages);
        this.send({
          id,
          type: "phase",
          message: "Reading option probabilities…",
        });
        const direct = await this.score(decision);
        this.send({ id, type: "direct", result: direct });
        this.send({
          id,
          type: "phase",
          message: "Generating JSON, one token at a time…",
        });
        const started = performance.now();
        let text = "";
        let firstTokenMs: number | null = null;
        let inputTokens = 0;
        let outputTokens = 0;
        let truncated = false;
        const stream = await this.engine.stream({
          messages,
          stream_options: { include_usage: true },
          max_tokens: OUTPUT_TOKENS,
          temperature: 0,
          cache_prompt: false,
          chat_template_kwargs: { enable_thinking: false },
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta.content ?? "";
          if (delta && firstTokenMs === null)
            firstTokenMs = performance.now() - started;
          text += delta;
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
          if (chunk.choices[0]?.finish_reason === "length") truncated = true;
          this.send({ id, type: "stream", text, firstTokenMs, outputTokens });
        }
        const validation = truncated
          ? {
              valid: false,
              error:
                "Generation reached its 512-token limit. Try shorter options.",
            }
          : validateGeneration(text, decision);
        this.send({
          id,
          type: "complete",
          result: {
            text,
            firstTokenMs,
            inputTokens,
            outputTokens,
            totalMs: performance.now() - started,
            ...validation,
          },
        });
      }
    } catch (error) {
      if (request.type === "load") {
        try {
          await this.engine?.exit();
        } catch {
          /* A failed runtime may already be closed. */
        }
        this.engine = null;
        this.modelId = null;
        this.ready = false;
      }
      this.send({
        id,
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        ready: this.ready,
      });
    } finally {
      this.busy = false;
    }
  }
}
