import type { DirectResult, Event, GenerationResult } from "./protocol";
export interface Session {
  id: number;
  status: "idle" | "loading" | "ready" | "running";
  message: string;
  error: string | null;
  loaded: number;
  total: number;
  loadMs: number | null;
  warmupMs: number | null;
  direct: DirectResult | null;
  generation: GenerationResult | null;
  text: string;
  firstTokenMs: number | null;
  outputTokens: number;
}
export const initialSession: Session = {
  id: 0,
  status: "idle",
  message: "Choose a model and load it when you’re ready.",
  error: null,
  loaded: 0,
  total: 0,
  loadMs: null,
  warmupMs: null,
  direct: null,
  generation: null,
  text: "",
  firstTokenMs: null,
  outputTokens: 0,
};
export type SessionAction =
  | { type: "start"; id: number; operation: "load" | "compare" }
  | { type: "reset"; id: number }
  | { type: "edit" }
  | { type: "event"; event: Event };
const emptyResults = {
  direct: null,
  generation: null,
  text: "",
  firstTokenMs: null,
  outputTokens: 0,
};
export function sessionReducer(state: Session, action: SessionAction): Session {
  if (action.type === "reset") return { ...initialSession, id: action.id };
  if (action.type === "edit") return { ...state, ...emptyResults, error: null };
  if (action.type === "start")
    return {
      ...(action.operation === "load" ? initialSession : state),
      ...emptyResults,
      id: action.id,
      status: action.operation === "load" ? "loading" : "running",
      error: null,
      message:
        action.operation === "load"
          ? "Preparing the model…"
          : "Starting comparison…",
    };
  const event = action.event;
  if (event.id !== state.id) return state;
  switch (event.type) {
    case "progress":
      return { ...state, loaded: event.loaded, total: event.total };
    case "phase":
      return { ...state, message: event.message };
    case "loaded":
      return { ...state, loadMs: event.loadMs };
    case "ready":
      return {
        ...state,
        status: "ready",
        warmupMs: event.warmupMs,
        message: "Model ready. Your comparison runs locally on WebGPU.",
      };
    case "direct":
      return { ...state, direct: event.result };
    case "stream":
      return {
        ...state,
        text: event.text,
        firstTokenMs: event.firstTokenMs,
        outputTokens: event.outputTokens,
      };
    case "complete":
      return {
        ...state,
        status: "ready",
        generation: event.result,
        text: event.result.text,
        firstTokenMs: event.result.firstTokenMs,
        outputTokens: event.result.outputTokens,
        message: "Comparison complete. Edit the decision or run it again.",
      };
    case "error":
      return {
        ...state,
        status: event.ready ? "ready" : "idle",
        error: event.message,
        message: event.ready
          ? "You can edit the decision and retry."
          : "Try loading again, or choose the smaller model.",
      };
  }
}
