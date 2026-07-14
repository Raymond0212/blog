export type EmbeddingToken = {
  index: number;
  sentenceIndex: number;
  id: number;
  text: string;
  isSpecial: boolean;
  vector: number[];
};

export type SentenceEmbedding = {
  index: number;
  text: string;
  sentenceVector: number[];
  tokens: EmbeddingToken[];
};

export type EmbeddingPayload = {
  dimensions: number;
  modelId: string;
  sentences: SentenceEmbedding[];
};

export type WorkerRequest =
  | { type: "initialize" }
  | { type: "embed"; requestId: number; sentences: string[] };

export type WorkerResponse =
  | { type: "progress"; message: string; percent: number | null }
  | { type: "ready"; modelId: string }
  | { type: "result"; requestId: number; payload: EmbeddingPayload }
  | { type: "error"; requestId?: number; message: string };
