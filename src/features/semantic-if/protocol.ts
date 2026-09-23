import type { Decision } from "./decision";
import type { ModelId } from "./models";

export type Request =
  | { id: number; type: "load"; modelId: ModelId }
  | { id: number; type: "compare"; decision: Decision };
export interface DirectResult {
  options: { label: string; description: string; probability: number }[];
  totalMs: number;
  inputTokens: number;
}
export interface GenerationResult {
  text: string;
  totalMs: number;
  firstTokenMs: number | null;
  inputTokens: number;
  outputTokens: number;
  valid: boolean;
  error: string | null;
}
export type Event = { id: number } & (
  | { type: "progress"; loaded: number; total: number }
  | { type: "phase"; message: string }
  | { type: "loaded"; loadMs: number }
  | { type: "ready"; warmupMs: number }
  | { type: "direct"; result: DirectResult }
  | {
      type: "stream";
      text: string;
      firstTokenMs: number | null;
      outputTokens: number;
    }
  | { type: "complete"; result: GenerationResult }
  | { type: "error"; message: string; ready: boolean }
);
