import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type {
  EmbeddingPayload,
  EmbeddingToken,
  WorkerRequest,
  WorkerResponse,
} from "@/features/embedding/embedding-types";
import { Loader2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Vector3 = { x: number; y: number; z: number };
type PointRole = "neighbor" | "token" | "selected" | "sentence" | "special";
type ModelPoint = Vector3 & {
  id: string;
  label: string;
  role: PointRole;
  series: number;
};
type ProjectedPayload = {
  sentencePositions: Vector3[];
  tokenPositions: Vector3[];
};
type Neighbor = {
  distance: number;
  flatIndex: number;
  position: Vector3;
  token: EmbeddingToken;
};

const DEFAULT_INPUT = [
  "We sat on the river bank and watched the water flow.",
  "The financial bank approved our business loan.",
].join("\n");

function parseSentences(value: string): string[] {
  return value
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => value / magnitude);
}

function add(a: number[], b: number[], weight = 1): number[] {
  return a.map((value, index) => value + b[index] * weight);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((total, value, index) => total + value * b[index], 0);
}

function distance3(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pca3(matrix: number[][]): Vector3[] {
  if (!matrix.length) return [];
  const dimensions = matrix[0].length;
  const means = Array.from(
    { length: dimensions },
    (_, dimension) =>
      matrix.reduce((sum, row) => sum + row[dimension], 0) / matrix.length,
  );
  const centered = matrix.map((row) =>
    row.map((value, dimension) => value - means[dimension]),
  );
  const covariance = Array.from({ length: dimensions }, (_, row) =>
    Array.from(
      { length: dimensions },
      (_, column) =>
        centered.reduce(
          (sum, vector) => sum + vector[row] * vector[column],
          0,
        ) / Math.max(centered.length - 1, 1),
    ),
  );
  const components: number[][] = [];
  for (let component = 0; component < 3; component += 1) {
    let vector = normalize(
      Array.from({ length: dimensions }, (_, index) =>
        Math.sin((index + 1) * (component + 1) * 1.7),
      ),
    );
    for (let iteration = 0; iteration < 42; iteration += 1) {
      let next = covariance.map((row) => dot(row, vector));
      components.forEach((previous) => {
        next = add(next, previous, -dot(next, previous));
      });
      vector = normalize(next);
    }
    components.push(vector);
  }
  const projected = centered.map((row) =>
    components.map((component) => dot(row, component)),
  );
  const maxima = [0, 1, 2].map((dimension) =>
    Math.max(...projected.map((row) => Math.abs(row[dimension])), 0.001),
  );
  return projected.map((row) => ({
    x: (row[0] / maxima[0]) * 112,
    y: (row[1] / maxima[1]) * 112,
    z: (row[2] / maxima[2]) * 112,
  }));
}

function projectPayload(payload: EmbeddingPayload): ProjectedPayload {
  const tokens = payload.sentences.flatMap((sentence) => sentence.tokens);
  const matrix = [
    ...tokens.map((token) => token.vector),
    ...payload.sentences.map((sentence) => sentence.sentenceVector),
  ];
  const positions = pca3(matrix);
  return {
    tokenPositions: positions.slice(0, tokens.length),
    sentencePositions: positions.slice(tokens.length),
  };
}

function createWorker(): Worker {
  return new Worker(new URL("./embedding.worker.ts", import.meta.url), {
    type: "module",
  });
}

function firstSelectableToken(tokens: EmbeddingToken[]): number {
  const index = tokens.findIndex((token) => !token.isSpecial);
  return index >= 0 ? index : 0;
}

function tokenKey(token: EmbeddingToken): string {
  return `${token.sentenceIndex}:${token.index}`;
}

export default function EmbeddingDemoPage() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [embeddedInput, setEmbeddedInput] = useState("");
  const [payload, setPayload] = useState<EmbeddingPayload | null>(null);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(true);
  const [loadMessage, setLoadMessage] = useState("Starting model runtime");
  const [loadPercent, setLoadPercent] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef(input);
  const requestedInputRef = useRef(input);
  const latestRequestRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef({ x: -0.24, y: 0.46 });
  const zoomRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const requestEmbedding = useCallback((value: string) => {
    const worker = workerRef.current;
    const sentences = parseSentences(value);
    if (!worker || !sentences.length) return;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    requestedInputRef.current = value;
    setIsEmbedding(true);
    setErrorMessage(null);
    const request: WorkerRequest = { type: "embed", requestId, sentences };
    worker.postMessage(request);
  }, []);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        setLoadMessage(response.message);
        setLoadPercent(response.percent);
        return;
      }
      if (response.type === "ready") {
        setIsReady(true);
        setLoadMessage("Model ready");
        requestEmbedding(inputRef.current);
        return;
      }
      if (response.type === "result") {
        if (response.requestId !== latestRequestRef.current) return;
        const flatTokens = response.payload.sentences.flatMap(
          (sentence) => sentence.tokens,
        );
        setPayload(response.payload);
        setEmbeddedInput(requestedInputRef.current);
        setSelectedTokenIndex(firstSelectableToken(flatTokens));
        setIsEmbedding(false);
        return;
      }
      setErrorMessage(response.message);
      setIsEmbedding(false);
    };
    worker.onerror = () => {
      setErrorMessage("The browser could not start the embedding worker.");
      setIsEmbedding(false);
    };
    const request: WorkerRequest = { type: "initialize" };
    worker.postMessage(request);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [requestEmbedding]);

  useEffect(() => {
    const sentences = parseSentences(input);
    if (!sentences.length) {
      setPayload(null);
      setIsEmbedding(false);
      return;
    }
    if (!isReady || input === embeddedInput) return;
    const timeout = window.setTimeout(() => requestEmbedding(input), 650);
    return () => window.clearTimeout(timeout);
  }, [embeddedInput, input, isReady, requestEmbedding]);

  const flatTokens = useMemo(
    () => payload?.sentences.flatMap((sentence) => sentence.tokens) ?? [],
    [payload],
  );
  const projected = useMemo(
    () => (payload ? projectPayload(payload) : null),
    [payload],
  );
  const selectedToken = flatTokens[selectedTokenIndex] ?? null;
  const neighbors = useMemo<Neighbor[]>(() => {
    if (!projected || !selectedToken) return [];
    const selectedPosition = projected.tokenPositions[selectedTokenIndex];
    return flatTokens
      .map((token, flatIndex) => ({
        distance: distance3(
          selectedPosition,
          projected.tokenPositions[flatIndex],
        ),
        flatIndex,
        position: projected.tokenPositions[flatIndex],
        token,
      }))
      .filter(
        (candidate) =>
          candidate.flatIndex !== selectedTokenIndex &&
          !candidate.token.isSpecial,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [flatTokens, projected, selectedToken, selectedTokenIndex]);
  const points = useMemo<ModelPoint[]>(() => {
    if (!payload || !projected) return [];
    const neighborKeys = new Set(neighbors.map(({ token }) => tokenKey(token)));
    return [
      ...flatTokens.map((token, index) => ({
        id: `token:${tokenKey(token)}`,
        label: `${token.text} · S${token.sentenceIndex + 1}`,
        role:
          index === selectedTokenIndex
            ? ("selected" as const)
            : neighborKeys.has(tokenKey(token))
              ? ("neighbor" as const)
              : token.isSpecial
                ? ("special" as const)
                : ("token" as const),
        series: (token.sentenceIndex % 5) + 1,
        ...projected.tokenPositions[index],
      })),
      ...payload.sentences.map((sentence, index) => ({
        id: `sentence:${sentence.index}`,
        label: `Sentence ${sentence.index + 1}`,
        role: "sentence" as const,
        series: (sentence.index % 5) + 1,
        ...projected.sentencePositions[index],
      })),
    ];
  }, [flatTokens, neighbors, payload, projected, selectedTokenIndex]);

  const resetView = useCallback(() => {
    rotationRef.current = { x: -0.24, y: 0.46 };
    zoomRef.current = 1;
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    rotationRef.current.y += (event.clientX - dragRef.current.x) * 0.008;
    rotationRef.current.x += (event.clientY - dragRef.current.y) * 0.008;
    dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let previousTime = performance.now();
    const root = document.documentElement;
    const color = (token: string, alpha = 1) => {
      const value = getComputedStyle(root).getPropertyValue(token).trim();
      return `hsl(${value} / ${alpha})`;
    };
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const render = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const elapsed = Math.min(time - previousTime, 40);
      previousTime = time;
      if (isRotating && !dragRef.current) {
        rotationRef.current.y += elapsed * 0.00012;
      }
      context.clearRect(0, 0, width, height);
      const { x: angleX, y: angleY } = rotationRef.current;
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const baseScale = Math.min(width, height) / 390;
      const project = (point: Vector3) => {
        const x1 = point.x * cosY - point.z * sinY;
        const z1 = point.x * sinY + point.z * cosY;
        const y1 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        const perspective = 460 / (460 + z2);
        return {
          x: width / 2 + x1 * baseScale * perspective * zoomRef.current,
          y: height / 2 + y1 * baseScale * perspective * zoomRef.current,
          z: z2,
          perspective,
        };
      };
      context.lineWidth = 1;
      context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      const axes: Array<[Vector3, Vector3, string]> = [
        [{ x: -125, y: 0, z: 0 }, { x: 125, y: 0, z: 0 }, "PC 1"],
        [{ x: 0, y: -125, z: 0 }, { x: 0, y: 125, z: 0 }, "PC 2"],
        [{ x: 0, y: 0, z: -125 }, { x: 0, y: 0, z: 125 }, "PC 3"],
      ];
      axes.forEach(([start, end, label]) => {
        const a = project(start);
        const b = project(end);
        context.strokeStyle = color("--border", 0.68);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
        context.fillStyle = color("--muted-foreground", 0.72);
        context.fillText(label, b.x + 5, b.y - 5);
      });
      const screenPoints = points
        .map((point) => ({ point, screen: project(point) }))
        .sort((a, b) => a.screen.z - b.screen.z);
      const selected = screenPoints.find(
        ({ point }) => point.role === "selected",
      );
      if (selected) {
        screenPoints
          .filter(({ point }) => point.role === "neighbor")
          .forEach(({ screen }) => {
            context.strokeStyle = color("--foreground", 0.18);
            context.setLineDash([3, 5]);
            context.beginPath();
            context.moveTo(selected.screen.x, selected.screen.y);
            context.lineTo(screen.x, screen.y);
            context.stroke();
          });
        context.setLineDash([]);
      }
      screenPoints.forEach(({ point, screen }) => {
        const radius =
          (point.role === "selected"
            ? 6.5
            : point.role === "sentence"
              ? 5
              : point.role === "neighbor"
                ? 4.5
                : point.role === "special"
                  ? 1.5
                  : 3.5) * screen.perspective;
        context.fillStyle =
          point.role === "selected"
            ? color("--chart-1")
            : point.role === "neighbor"
              ? color("--chart-2", 0.9)
              : point.role === "sentence"
                ? color(`--chart-${point.series}`, 0.95)
                : point.role === "special"
                  ? color("--muted-foreground", 0.18)
                  : color(`--chart-${point.series}`, 0.62);
        context.beginPath();
        context.arc(screen.x, screen.y, Math.max(radius, 1.1), 0, Math.PI * 2);
        context.fill();
        if (point.role === "selected") {
          context.strokeStyle = color("--chart-1", 0.25);
          context.lineWidth = 8;
          context.stroke();
        }
      });
      const priority: Record<PointRole, number> = {
        selected: 0,
        neighbor: 1,
        sentence: 2,
        token: 3,
        special: 4,
      };
      const placed: Array<{
        left: number;
        right: number;
        top: number;
        bottom: number;
      }> = [];
      screenPoints
        .filter(({ point }) =>
          ["selected", "neighbor", "sentence"].includes(point.role),
        )
        .sort((a, b) => priority[a.point.role] - priority[b.point.role])
        .forEach(({ point, screen }) => {
          context.font =
            point.role === "selected"
              ? "600 13px ui-sans-serif, system-ui"
              : "12px ui-sans-serif, system-ui";
          const textWidth = context.measureText(point.label).width;
          const x = Math.min(screen.x + 9, width - textWidth - 8);
          let y = screen.y - 8;
          for (const offset of [-8, 12, -28, 32, -48, 52, -68, 72]) {
            const candidateY = Math.min(
              height - 8,
              Math.max(18, screen.y + offset),
            );
            const candidate = {
              left: x - 3,
              right: x + textWidth + 3,
              top: candidateY - 12,
              bottom: candidateY + 5,
            };
            const overlaps = placed.some(
              (label) =>
                candidate.left < label.right &&
                candidate.right > label.left &&
                candidate.top < label.bottom &&
                candidate.bottom > label.top,
            );
            if (!overlaps) {
              y = candidateY;
              placed.push(candidate);
              break;
            }
          }
          context.fillStyle = color("--background", 0.87);
          context.fillRect(x - 3, y - 12, textWidth + 6, 17);
          context.fillStyle = color("--foreground");
          context.fillText(point.label, x, y);
        });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [isRotating, points]);

  const hasCurrentResult = Boolean(payload && embeddedInput === input);
  const sentenceCount =
    payload?.sentences.length ?? parseSentences(input).length;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-1 sm:p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="size-4" /> Multi-sentence embedding lab
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Visual Demo of Embedding.
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Enter one sentence per line. Select any token to reveal its three
          closest displayed tokens.
        </p>
      </div>

      {!isReady ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading tokenizer and
              model
            </span>
            <span className="text-xs text-muted-foreground">
              {loadPercent === null ? "Preparing…" : `${loadPercent}%`}
            </span>
          </div>
          <Progress value={loadPercent ?? 0} />
          <p className="truncate text-xs text-muted-foreground">
            {loadMessage}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium" htmlFor="embedding-sentences">
            Sentences{" "}
            <span className="font-normal text-muted-foreground">
              · one per line · up to 8
            </span>
          </label>
          <span className="text-xs text-muted-foreground">
            {!isReady
              ? "Loading model…"
              : isEmbedding
                ? "Running inference…"
                : `${sentenceCount} sentences embedded`}
          </span>
        </div>
        <Textarea
          id="embedding-sentences"
          value={input}
          onChange={(event) => setInput(event.target.value.slice(0, 1200))}
          placeholder={
            "The river reached the bank.\nThe bank approved the loan."
          }
          rows={5}
          maxLength={1200}
          className="resize-y text-base"
          disabled={!isReady}
        />
      </div>

      <div
        className="flex flex-col gap-3"
        aria-label="Official WordPiece tokens by sentence"
      >
        {payload?.sentences.map((sentence) => {
          const priorTokenCount = payload.sentences
            .slice(0, sentence.index)
            .reduce((total, item) => total + item.tokens.length, 0);
          return (
            <div key={sentence.index} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Sentence {sentence.index + 1}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sentence.tokens.map((token) => {
                  const flatIndex = priorTokenCount + token.index;
                  const selected = flatIndex === selectedTokenIndex;
                  return (
                    <Button
                      key={tokenKey(token)}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="h-auto min-h-9 px-2.5 py-1 font-mono text-xs"
                      disabled={token.isSpecial || !hasCurrentResult}
                      aria-pressed={selected}
                      title={`Sentence ${sentence.index + 1}, token ID ${token.id}`}
                      onClick={() => setSelectedTokenIndex(flatIndex)}
                    >
                      <span>{token.text}</span>
                      <span className="opacity-60">#{token.id}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        }) ?? (
          <span className="text-sm text-muted-foreground">
            Tokens appear after the model loads.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">
          Closest in PCA space
        </span>
        {neighbors.map((neighbor) => (
          <span
            key={tokenKey(neighbor.token)}
            className="rounded-md bg-secondary px-2.5 py-1.5 text-secondary-foreground"
          >
            {neighbor.token.text} · S{neighbor.token.sentenceIndex + 1} · d=
            {neighbor.distance.toFixed(1)}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsRotating((value) => !value)}
            aria-pressed={!isRotating}
            disabled={!payload}
          >
            {isRotating ? <Pause /> : <Play />}
            {isRotating ? "Pause" : "Rotate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            onClick={resetView}
            aria-label="Reset 3D view"
            disabled={!payload}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-background/50 shadow-sm">
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md border bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
          {selectedToken && hasCurrentResult ? (
            <>
              <span className="font-medium text-foreground">
                {selectedToken.text}
              </span>{" "}
              · Sentence {selectedToken.sentenceIndex + 1} · token ID{" "}
              {selectedToken.id} · 3 nearest in displayed PCA space
            </>
          ) : (
            "Waiting for current embeddings"
          )}
        </div>
        <canvas
          ref={canvasRef}
          className="h-[480px] w-full touch-none cursor-grab active:cursor-grabbing sm:h-[560px]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={(event) => {
            event.preventDefault();
            zoomRef.current = Math.min(
              1.55,
              Math.max(0.68, zoomRef.current - event.deltaY * 0.001),
            );
          }}
          role="img"
          aria-label={`PCA projection of tokens from ${sentenceCount} sentences. ${selectedToken?.text ?? "No token"} is selected.`}
        />
        {!payload ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Preparing
            embeddings
          </div>
        ) : null}
        <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground">
          Drag to orbit · Scroll to zoom · distance uses displayed PC 1–3
          coordinates
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>
          Model: {payload?.modelId ?? "onnx-community/all-MiniLM-L6-v2-ONNX"}
        </span>
      </div>
    </section>
  );
}
