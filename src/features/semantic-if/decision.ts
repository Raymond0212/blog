export interface Decision {
  state: string;
  question: string;
  options: string[];
}
export type Message = { role: "system" | "user"; content: string };
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 20;
export const CONTEXT_SIZE = 2048;
export const OUTPUT_TOKENS = 512;
export const labelFor = (index: number) => String.fromCharCode(65 + index);

export interface OptionScores {
  top_probs?: { token: string; bytes: number[] | null; prob: number }[];
  top_logprobs?: { token: string; bytes: number[] | null; logprob: number }[];
}
export function optionDistribution(
  scores: OptionScores | undefined,
  labels: string[],
): number[] {
  const matches = (
    entry: { token: string; bytes: number[] | null },
    label: string,
  ) =>
    entry.token === label ||
    (entry.bytes?.length === 1 && entry.bytes[0] === label.charCodeAt(0));
  if (scores?.top_probs) {
    const values = labels.map(
      (label) =>
        scores.top_probs?.find((entry) => matches(entry, label))?.prob ?? NaN,
    );
    const sum = values.reduce((total, value) => total + value, 0);
    if (
      !labels.length ||
      values.some(
        (value) => !Number.isFinite(value) || value < 0 || value > 1,
      ) ||
      sum <= 0
    )
      throw new Error(
        "The model did not return a probability for every allowed option.",
      );
    return values.map((value) => value / sum);
  }
  return normalizeLogprobs(
    labels.map(
      (label) =>
        scores?.top_logprobs?.find((entry) => matches(entry, label))?.logprob ??
        NaN,
    ),
  );
}

export function normalizeLogprobs(values: number[]): number[] {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(
      "The model did not return a finite score for every option.",
    );
  }
  const maximum = Math.max(...values);
  const weights = values.map((value) => Math.exp(value - maximum));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

export function validateDecision(decision: Decision): Decision {
  if (
    !Array.isArray(decision.options) ||
    decision.options.length < MIN_OPTIONS ||
    decision.options.length > MAX_OPTIONS
  ) {
    throw new Error("Provide between 2 and 20 options.");
  }
  if (
    ![decision.state, decision.question, ...decision.options].every(
      (value) => typeof value === "string" && value.trim(),
    )
  ) {
    throw new Error("Fill in the state, question, and every option.");
  }
  return {
    state: decision.state.trim(),
    question: decision.question.trim(),
    options: decision.options.map((option) => option.trim()),
  };
}

export function buildMessages(
  decision: Decision,
  mode: "direct" | "generation",
): Message[] {
  const labels = decision.options.map((_, index) => labelFor(index));
  const instruction =
    mode === "direct"
      ? `Reply with exactly one option letter from: ${labels.join(", ")}.`
      : `Estimate the probability that each allowed option is the correct decision.
Return only one JSON object mapping each option to its probability. Form every key as "<label>: <full option text>" using the allowed options above.
For example, if the unrelated options were "A. Route north" and "B. Route south", valid output would be:
{"A: Route north": 0.65, "B: Route south": 0.35}
For the actual decision, include every supplied option exactly once and in order. Each value must be a JSON number from 0 to 1, and the probabilities must sum to 1. Output JSON only, with no markdown or explanation.`;
  return [
    {
      role: "system",
      content:
        "Make the requested decision from the supplied state. Follow the output format exactly.",
    },
    {
      role: "user",
      content: `State:\n${decision.state}\n\nQuestion:\n${decision.question}\n\nAllowed options:\n${decision.options.map((option, index) => `${labels[index]}. ${option}`).join("\n")}\n\n${instruction}`,
    },
  ];
}

export function validatePromptBudget(messages: Message[]): void {
  // These byte-level tokenizers use at most one token per UTF-8 byte of text.
  // Reserve 256 tokens for the pinned models' chat templates and 512 for output.
  // This intentionally rejects some prompts that a precise tokenizer could fit.
  const bytes = messages.reduce(
    (sum, message) => sum + new TextEncoder().encode(message.content).length,
    0,
  );
  if (bytes + 256 + OUTPUT_TOKENS > CONTEXT_SIZE) {
    throw new Error(
      "Please shorten the state or options to fit the model’s context. Space is reserved for the JSON response.",
    );
  }
}

export function validateGeneration(
  text: string,
  decision: Decision,
): { valid: boolean; error: string | null } {
  try {
    const parsed: unknown = JSON.parse(
      text.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i, ""),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Expected one JSON object.");
    const keys = decision.options.map(
      (option, index) => `${labelFor(index)}: ${option}`,
    );
    if (
      Object.keys(parsed).length !== keys.length ||
      !keys.every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
    ) {
      throw new Error("The response must include every exact option key once.");
    }
    const values = keys.map((key) => (parsed as Record<string, unknown>)[key]);
    if (
      !values.every(
        (value): value is number =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 1,
      )
    ) {
      throw new Error("Every probability must be a number between 0 and 1.");
    }
    if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.02)
      throw new Error("Probabilities must sum to 1 (within 0.02).");
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid JSON response.",
    };
  }
}
