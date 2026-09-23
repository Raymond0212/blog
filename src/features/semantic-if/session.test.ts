import { expect, it } from "vitest";
import { initialSession, sessionReducer } from "./session";

it("ignores old results after a reset and clears results when the decision changes", () => {
  const running = sessionReducer(
    { ...initialSession, status: "ready" },
    { type: "start", id: 2, operation: "compare" },
  );
  const stale = sessionReducer(running, {
    type: "event",
    event: {
      id: 1,
      type: "stream",
      text: "old answer",
      firstTokenMs: 10,
      outputTokens: 2,
    },
  });
  expect(stale.text).toBe("");
  const current = sessionReducer(running, {
    type: "event",
    event: {
      id: 2,
      type: "stream",
      text: "current answer",
      firstTokenMs: 10,
      outputTokens: 2,
    },
  });
  expect(current.text).toBe("current answer");
  expect(sessionReducer(current, { type: "edit" }).text).toBe("");
  const reset = sessionReducer(current, { type: "reset", id: 3 });
  expect(
    sessionReducer(reset, {
      type: "event",
      event: { id: 2, type: "ready", warmupMs: 2 },
    }).status,
  ).toBe("idle");
});

it("makes load errors retryable and preserves a loaded model after a recoverable run error", () => {
  const loading = sessionReducer(initialSession, {
    type: "start",
    id: 1,
    operation: "load",
  });
  expect(loading.status).toBe("loading");
  const failed = sessionReducer(loading, {
    type: "event",
    event: { id: 1, type: "error", ready: false, message: "Download failed" },
  });
  expect(failed.status).toBe("idle");
  expect(failed.error).toBe("Download failed");
  const retry = sessionReducer(failed, {
    type: "start",
    id: 2,
    operation: "load",
  });
  expect(retry.error).toBeNull();
  const ready = sessionReducer(retry, {
    type: "event",
    event: { id: 2, type: "ready", warmupMs: 12 },
  });
  expect(ready.status).toBe("ready");
  expect(
    sessionReducer(ready, {
      type: "event",
      event: { id: 2, type: "error", ready: true, message: "Shorten input" },
    }).status,
  ).toBe("ready");
});
