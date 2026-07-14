/// <reference lib="webworker" />

import { pipeline } from "@huggingface/transformers";
import type {
  EmbeddingPayload,
  EmbeddingToken,
  SentenceEmbedding,
  WorkerRequest,
  WorkerResponse,
} from "@/features/embedding/embedding-types";

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";

type TensorLike = {
  tolist: () => unknown;
};

type TokenizerLike = {
  all_special_ids: number[];
  encode: (
    text: string,
    options?: { add_special_tokens?: boolean },
  ) => number[];
  tokenize: (
    text: string,
    options?: { add_special_tokens?: boolean },
  ) => string[];
  decode: (
    ids: number[],
    options?: {
      clean_up_tokenization_spaces?: boolean;
      skip_special_tokens?: boolean;
    },
  ) => string;
};

type ExtractorLike = {
  tokenizer: TokenizerLike;
  (
    text: string,
    options?: { pooling?: "none"; normalize?: boolean },
  ): Promise<TensorLike>;
};

let extractorPromise: Promise<ExtractorLike> | null = null;

function post(response: WorkerResponse) {
  self.postMessage(response);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => value / magnitude);
}

function progressMessage(progress: unknown): void {
  if (!progress || typeof progress !== "object") return;
  const record = progress as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "loading";
  const file =
    typeof record.file === "string" ? record.file.split("/").pop() : null;
  const rawProgress =
    typeof record.progress === "number" ? record.progress : null;
  post({
    type: "progress",
    message: file ? `${status}: ${file}` : status,
    percent: rawProgress === null ? null : Math.round(rawProgress),
  });
}

async function getExtractor(): Promise<ExtractorLike> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID, {
      dtype: "q4",
      progress_callback: progressMessage,
    }) as unknown as Promise<ExtractorLike>;
  }
  return extractorPromise;
}

function alignTokens(
  tokenizer: TokenizerLike,
  sentence: string,
  ids: number[],
): string[] {
  const officialTokens = tokenizer.tokenize(sentence, {
    add_special_tokens: true,
  });
  if (officialTokens.length === ids.length) return officialTokens;
  return ids.map((id) =>
    tokenizer.decode([id], {
      clean_up_tokenization_spaces: false,
      skip_special_tokens: false,
    }),
  );
}

async function embedOneSentence(
  extractor: ExtractorLike,
  text: string,
  sentenceIndex: number,
): Promise<SentenceEmbedding> {
  const tensor = await extractor(text, { pooling: "none", normalize: false });
  const hiddenStates = (tensor.tolist() as number[][][])[0];
  const ids = extractor.tokenizer.encode(text, { add_special_tokens: true });
  const tokenStrings = alignTokens(extractor.tokenizer, text, ids);
  const specialIds = new Set(extractor.tokenizer.all_special_ids.map(Number));
  const usableLength = Math.min(
    hiddenStates.length,
    ids.length,
    tokenStrings.length,
  );
  const tokens: EmbeddingToken[] = Array.from(
    { length: usableLength },
    (_, index) => ({
      index,
      sentenceIndex,
      id: Number(ids[index]),
      text: tokenStrings[index],
      isSpecial: specialIds.has(Number(ids[index])),
      vector: hiddenStates[index],
    }),
  );
  const dimensions = hiddenStates[0]?.length ?? 384;
  const sentenceVector = normalize(
    Array.from(
      { length: dimensions },
      (_, dimension) =>
        tokens.reduce((sum, token) => sum + token.vector[dimension], 0) /
        Math.max(tokens.length, 1),
    ),
  );
  return { index: sentenceIndex, text, sentenceVector, tokens };
}

async function embedSentences(sentences: string[]): Promise<EmbeddingPayload> {
  const extractor = await getExtractor();
  const results: SentenceEmbedding[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    post({
      type: "progress",
      message: `Embedding sentence ${index + 1}/${sentences.length}`,
      percent: Math.round(((index + 1) / sentences.length) * 100),
    });
    results.push(await embedOneSentence(extractor, sentences[index], index));
  }
  return {
    dimensions: results[0]?.tokens[0]?.vector.length ?? 384,
    modelId: MODEL_ID,
    sentences: results,
  };
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "initialize") {
      await getExtractor();
      post({ type: "ready", modelId: MODEL_ID });
      return;
    }
    const payload = await embedSentences(request.sentences);
    post({ type: "result", requestId: request.requestId, payload });
  } catch (error) {
    post({
      type: "error",
      requestId: request.type === "embed" ? request.requestId : undefined,
      message: error instanceof Error ? error.message : "Embedding failed",
    });
  }
});
