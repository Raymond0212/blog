import {
  Wllama,
  LoggerWithoutDebug,
  type ChatCompletionParams,
} from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { ComparisonRuntime, type Engine } from "./runtime";
import { MODELS } from "./models";
import { CONTEXT_SIZE } from "./decision";
import type { Request } from "./protocol";

function createEngine(): Engine {
  const engine = new Wllama(
    { default: new URL(wasmUrl, self.location.origin).href },
    {
      logger: LoggerWithoutDebug,
      suppressNativeLog: true,
      parallelDownloads: 4,
    },
  );
  return {
    load: async (modelId, progress) => {
      await engine.loadModelFromUrl(MODELS[modelId].url, {
        n_ctx: CONTEXT_SIZE,
        n_batch: 512,
        n_threads: 1,
        n_gpu_layers: 999,
        progressCallback: ({ loaded, total }) => progress(loaded, total),
      });
      if (!engine.isSupportWebGPU())
        throw new Error(
          "The model could not use WebGPU. Try a current Chrome or Edge browser with GPU acceleration enabled.",
        );
    },
    complete: (params) =>
      engine.createChatCompletion({
        ...params,
        stream: false,
      } as ChatCompletionParams & { stream: false }),
    stream: (params) =>
      engine.createChatCompletion({
        ...params,
        stream: true,
      } as ChatCompletionParams & { stream: true }),
    exit: () => engine.exit(),
  };
}

const runtime = new ComparisonRuntime(createEngine, (event) =>
  self.postMessage(event),
);
self.onmessage = (event: MessageEvent<Request>) => {
  void runtime.handle(event.data);
};
