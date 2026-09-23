import { describe, expect, it } from "vitest";
import {
  optionDistribution,
  buildMessages,
  normalizeLogprobs,
  validateDecision,
  validateGeneration,
  validatePromptBudget,
} from "./decision";

const decision = {
  state: "Locked out",
  question: "Which queue?",
  options: ["Account", "Billing"],
};

describe("decision comparison", () => {
  it("reads post-sampling probabilities, including zero, in displayed option order", () => {
    expect(
      optionDistribution(
        {
          top_probs: [
            { token: "B", bytes: [66], prob: 0.25 },
            { token: "A", bytes: [65], prob: 0.75 },
            { token: "C", bytes: [67], prob: 0 },
          ],
        },
        ["A", "B", "C"],
      ),
    ).toEqual([0.75, 0.25, 0]);
    expect(() =>
      optionDistribution(
        { top_probs: [{ token: "A", bytes: [65], prob: 1 }] },
        ["A", "B"],
      ),
    ).toThrow();
  });
  it("normalizes large logits without overflow and preserves option order", () => {
    expect(normalizeLogprobs([1000, 1000])).toEqual([0.5, 0.5]);
    expect(normalizeLogprobs([Math.log(3), 0])[0]).toBeCloseTo(0.75);
    expect(() => normalizeLogprobs([0, NaN])).toThrow();
    expect(() => normalizeLogprobs([])).toThrow();
  });
  it("rejects missing fields and options outside the supported range", () => {
    expect(validateDecision(decision)).toEqual(decision);
    for (const invalid of [
      { ...decision, state: " " },
      { ...decision, question: "" },
      { ...decision, options: ["one"] },
      { ...decision, options: ["one", " "] },
      { ...decision, options: Array(21).fill("choice") },
    ])
      expect(() => validateDecision(invalid)).toThrow();
    expect(
      validateDecision({ ...decision, options: Array(20).fill("choice") })
        .options,
    ).toHaveLength(20);
  });
  it("gives both methods the same decision but distinct output instructions", () => {
    const direct = buildMessages(decision, "direct");
    const generation = buildMessages(decision, "generation");
    for (const messages of [direct, generation]) {
      expect(messages[1].content).toContain(
        "State:\nLocked out\n\nQuestion:\nWhich queue?\n\nAllowed options:\nA. Account\nB. Billing",
      );
    }
    expect(direct[1].content).toContain("exactly one option letter");
    expect(generation[1].content).toContain("JSON");
  });
  it("reserves output and template space rather than allowing context overflow", () => {
    expect(() =>
      validatePromptBudget(buildMessages(decision, "generation")),
    ).not.toThrow();
    expect(() =>
      validatePromptBudget(
        buildMessages({ ...decision, state: "猫".repeat(2048) }, "generation"),
      ),
    ).toThrow(/shorten/i);
  });
  it("requires every exact option key and a normalized numeric distribution", () => {
    expect(
      validateGeneration('{"A: Account":0.75,"B: Billing":0.25}', decision),
    ).toEqual({ valid: true, error: null });
    expect(
      validateGeneration(
        '<think>reason</think> {"A: Account":0.5,"B: Billing":0.5}',
        decision,
      ).valid,
    ).toBe(true);
    for (const text of [
      '{"A: Account":1}',
      '{"A: Account":1,"B: Billing":1}',
      '{"A: Account":"0.5","B: Billing":0.5}',
      '{"A: Account":-0.1,"B: Billing":1.1}',
      '{"A: Account":0.5,"B: Other":0.5}',
      '{"A: Account":',
      "[]",
    ]) {
      expect(validateGeneration(text, decision).valid).toBe(false);
    }
  });
});
