import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  GitBranch,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELS, MODEL_IDS, PRESETS, type ModelId } from "./models";
import {
  buildMessages,
  labelFor,
  MAX_OPTIONS,
  MIN_OPTIONS,
  validateDecision,
  validatePromptBudget,
  type Decision,
} from "./decision";
import { initialSession, sessionReducer } from "./session";
import type { Event, Request } from "./protocol";

const seconds = (value: number | null) =>
  value === null ? "—" : `${(value / 1000).toFixed(3)} s`;
const panel = "min-w-0 rounded-xl border bg-background p-4 sm:p-6";

function SectionHeading({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {step}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm font-medium tabular-nums">
        {value}
      </dd>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function SemanticIfPage() {
  const [modelId, setModelId] = useState<ModelId>("minicpm5-2b");
  const [decision, setDecision] = useState<Decision>({
    ...PRESETS.account,
    options: [...PRESETS.account.options],
  });
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [support, setSupport] = useState<{ ready: boolean; message: string }>({
    ready: false,
    message: "Checking WebGPU support…",
  });
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const busy = session.status === "loading" || session.status === "running";
  const loaded = session.status === "ready" || session.status === "running";
  const model = MODELS[modelId];
  const progress =
    session.loadMs !== null
      ? 100
      : Number.isFinite(session.total) && session.total > 0
        ? Math.min(100, (session.loaded / session.total) * 100)
        : 0;
  const ratio =
    session.direct && session.generation && session.direct.totalMs > 0
      ? session.generation.totalMs / session.direct.totalMs
      : null;

  useEffect(() => {
    let active = true;
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> };
      }
    ).gpu;
    void (async () => {
      try {
        const adapter = await gpu?.requestAdapter();
        if (active)
          setSupport(
            adapter
              ? {
                  ready: true,
                  message:
                    "WebGPU available · nothing downloads until you click Load model.",
                }
              : {
                  ready: false,
                  message:
                    "WebGPU is unavailable. Use a current Chrome or Edge browser with GPU acceleration, over HTTPS or localhost.",
                },
          );
      } catch {
        if (active)
          setSupport({
            ready: false,
            message:
              "The browser could not access a GPU. Check GPU acceleration and reload this page.",
          });
      }
    })();
    return () => {
      active = false;
      requestId.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const reset = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    dispatch({ type: "reset", id: ++requestId.current });
  };
  const edit = (next: Decision) => {
    setDecision(next);
    dispatch({ type: "edit" });
  };
  const start = (operation: "load" | "compare") => {
    if (busy) return;
    let validated = decision;
    try {
      if (operation === "compare") {
        validated = validateDecision(decision);
        validatePromptBudget(buildMessages(validated, "generation"));
      }
      const id = ++requestId.current;
      dispatch({ type: "start", id, operation });
      if (!workerRef.current) {
        const worker = new Worker(
          new URL("./semantic-if.worker.ts", import.meta.url),
          { type: "module" },
        );
        workerRef.current = worker;
        worker.onmessage = ({ data }: MessageEvent<Event>) => {
          if (workerRef.current === worker)
            dispatch({ type: "event", event: data });
        };
        worker.onerror = (event) => {
          if (workerRef.current !== worker) return;
          worker.terminate();
          workerRef.current = null;
          dispatch({
            type: "event",
            event: {
              id: requestId.current,
              type: "error",
              ready: false,
              message: `The model worker stopped. ${event.message || "Try the smaller model or reload the page."}`,
            },
          });
        };
      }
      const request: Request =
        operation === "load"
          ? { id, type: "load", modelId }
          : { id, type: "compare", decision: validated };
      workerRef.current.postMessage(request);
    } catch (error) {
      dispatch({
        type: "event",
        event: {
          id: requestId.current,
          type: "error",
          ready: loaded,
          message:
            error instanceof Error
              ? error.message
              : "Unable to start the model.",
        },
      });
    }
  };

  return (
    <section
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-1 sm:p-3"
      aria-label="Semantic If experiment"
    >
      <header className="space-y-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GitBranch className="size-4" /> A local decision experiment
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Semantic If<span className="text-muted-foreground">.</span>
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Give a model a situation and a set of choices. Compare reading its
          option probabilities with asking it to write those probabilities as
          JSON, right here in your browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <ShieldCheck className="mr-1 size-3" /> Runs locally
          </Badge>
          <Badge variant="outline">No backend</Badge>
          <Badge variant="outline">Real timings</Badge>
          <Badge variant="outline">{model.size} download</Badge>
        </div>
      </header>

      <section className={`${panel} space-y-5`} aria-label="Model setup">
        <SectionHeading step="00 / Setup" title="Load a model">
          <Badge variant={loaded ? "secondary" : "outline"}>
            {loaded
              ? "Ready"
              : session.status === "loading"
                ? "Loading"
                : "Not loaded"}
          </Badge>
        </SectionHeading>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="semantic-model">Model</Label>
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelId(value as ModelId);
                dispatch({ type: "edit" });
              }}
              disabled={busy || loaded}
            >
              <SelectTrigger
                id="semantic-model"
                className="h-auto min-h-10 text-left [&>span]:min-w-0 [&>span]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {MODELS[id].name} · {MODELS[id].tier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => start("load")}
            disabled={!support.ready || busy || loaded}
          >
            {session.status === "loading" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : loaded ? (
              <Check className="mr-2 size-4" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            {loaded
              ? "Model ready"
              : session.status === "loading"
                ? "Loading model…"
                : "Load model"}
          </Button>
          {(busy || loaded || session.error) && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 size-4" />
              {busy ? "Cancel & reset" : "Unload / change"}
            </Button>
          )}
        </div>
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          {model.notice}
        </p>
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm">
            {support.ready ? session.message : support.message}
          </p>
          {session.error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {session.error} Try again; if memory is limited, select Qwen3
              0.6B.
            </p>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div>
            <Metric
              label="Download / cache"
              value={
                session.loadMs !== null
                  ? "Complete"
                  : session.total > 0
                    ? `${progress.toFixed(0)}%`
                    : "—"
              }
              detail={`${model.size} on first load`}
            />
            <Progress
              className="mt-2 h-1.5"
              value={progress}
              aria-label="Model download progress"
            />
          </div>
          <Metric
            label="Model load"
            value={seconds(session.loadMs)}
            detail="Download or cache + initialization"
          />
          <Metric
            label="Warmup"
            value={seconds(session.warmupMs)}
            detail="Prepare both comparison methods"
          />
        </dl>
        <p className="text-xs leading-5 text-muted-foreground">
          Weights download from Hugging Face and stay in your browser cache.
          Your decision text stays on this device. Leaving this menu releases
          the loaded model; cached weights can be reused.
        </p>
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Model quality · reference benchmarks
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <caption className="sr-only">
                Native checkpoint benchmark scores published by OpenJev / SemIf
              </caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  {[
                    "Model",
                    "Download",
                    "Authored",
                    "Perturbed",
                    "TypeSafe",
                  ].map((title) => (
                    <th
                      key={title}
                      className="whitespace-nowrap px-2 py-2 font-medium"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODEL_IDS.map((id) => (
                  <tr
                    key={id}
                    className={
                      id === modelId ? "border-b bg-muted/60" : "border-b"
                    }
                  >
                    <th className="whitespace-nowrap px-2 py-2 font-medium">
                      {MODELS[id].name}
                    </th>
                    <td className="whitespace-nowrap px-2 py-2">
                      {MODELS[id].size}
                    </td>
                    {MODELS[id].quality.map((value, index) => (
                      <td className="px-2 py-2 font-mono" key={index}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th className="px-2 py-2 font-medium">Published Jev</th>
                  <td className="px-2 py-2">Hosted</td>
                  <td className="px-2 py-2">—</td>
                  <td className="px-2 py-2">—</td>
                  <td className="px-2 py-2 font-mono">88.3%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Reported by{" "}
            <a
              className="underline underline-offset-4"
              href="https://openjev.com/"
              target="_blank"
              rel="noreferrer"
            >
              OpenJev / SemIf
            </a>
            , observed September 23, 2026. Authored and Perturbed are balanced
            accuracy; TypeSafe is agreement on a 102-case public subset. These
            are reference results for native checkpoints, not measurements from
            this page. Browser quantization can change accuracy.
          </p>
        </details>
      </section>

      <section className={`${panel} space-y-5`} aria-label="Decision editor">
        <SectionHeading step="01 / Decision" title="Give it a real choice">
          <Button onClick={() => start("compare")} disabled={!loaded || busy}>
            <Play className="mr-2 size-4" />
            {session.status === "running" ? "Running…" : "Run both methods"}
          </Button>
        </SectionHeading>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">
              Try an example
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                edit({
                  ...PRESETS.account,
                  options: [...PRESETS.account.options],
                })
              }
            >
              Account support
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                edit({ ...PRESETS.email, options: [...PRESETS.email.options] })
              }
            >
              Email triage
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="semantic-state">State</Label>
            <Textarea
              id="semantic-state"
              rows={4}
              value={decision.state}
              onChange={(event) =>
                edit({ ...decision, state: event.target.value })
              }
              className="resize-y text-sm leading-6"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="semantic-question">Question</Label>
            <Input
              id="semantic-question"
              value={decision.question}
              onChange={(event) =>
                edit({ ...decision, question: event.target.value })
              }
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Allowed options
            </legend>
            {decision.options.map((option, index) => (
              <div className="flex items-center gap-3" key={index}>
                <Label
                  htmlFor={`semantic-option-${index}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted font-mono text-xs"
                >
                  {labelFor(index)}
                </Label>
                <Input
                  id={`semantic-option-${index}`}
                  value={option}
                  placeholder="Describe this option"
                  onChange={(event) =>
                    edit({
                      ...decision,
                      options: decision.options.map((value, current) =>
                        current === index ? event.target.value : value,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </fieldset>
          <div className="flex items-center justify-end gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={decision.options.length <= MIN_OPTIONS}
              onClick={() =>
                edit({ ...decision, options: decision.options.slice(0, -1) })
              }
            >
              <Minus className="mr-1 size-3" />
              Remove
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              {decision.options.length} / {MAX_OPTIONS}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={decision.options.length >= MAX_OPTIONS}
              onClick={() =>
                edit({ ...decision, options: [...decision.options, ""] })
              }
            >
              <Plus className="mr-1 size-3" />
              Add
            </Button>
          </div>
        </fieldset>
        <p className="text-xs leading-5 text-muted-foreground">
          Both methods receive the same state, question, and choices. Only the
          requested output format changes. Keep inputs concise to leave space
          for the model’s response.
        </p>
      </section>

      <div
        className="grid items-center gap-3 rounded-xl border border-dashed p-4 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:p-5"
        aria-label="The two decision paths"
      >
        <div>
          <p className="text-xs text-muted-foreground">Your decision</p>
          <p className="mt-1 text-sm font-medium">State + question + options</p>
        </div>
        <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
        <ArrowDown className="mx-auto size-4 text-muted-foreground sm:hidden" />
        <div>
          <p className="text-xs text-muted-foreground">Same local model</p>
          <p className="mt-1 text-sm font-medium">{model.name}</p>
        </div>
        <GitBranch className="hidden size-4 text-muted-foreground sm:block" />
        <ArrowDown className="mx-auto size-4 text-muted-foreground sm:hidden" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Read option scores</p>
          <p className="text-sm text-muted-foreground">Then generate JSON</p>
        </div>
      </div>

      <div
        className="grid min-w-0 gap-5 lg:grid-cols-2"
        aria-label="Live comparison results"
      >
        <article className={`${panel} flex flex-col gap-4`}>
          <SectionHeading
            step="02A / Direct readout"
            title="Choice probabilities"
          >
            <Badge variant="outline">One readout</Badge>
          </SectionHeading>
          <p className="text-sm leading-6 text-muted-foreground">
            Read one option-token completion’s scores, then normalize across
            your allowed choices.
          </p>
          <div className="flex min-h-48 flex-1 flex-col justify-center gap-4 rounded-lg bg-muted/40 p-4">
            {session.direct ? (
              session.direct.options.map((option) => (
                <div className="space-y-2" key={option.label}>
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">
                      <span className="mr-2 font-mono text-muted-foreground">
                        {option.label}
                      </span>
                      {option.description}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {(option.probability * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={option.probability * 100}
                    className="h-1.5"
                    aria-label={`${option.label} probability`}
                  />
                </div>
              ))
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                {session.status === "running"
                  ? "Reading option scores…"
                  : "Waiting for a comparison"}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-3 border-t pt-4">
            <Metric
              label="Total"
              value={seconds(session.direct?.totalMs ?? null)}
            />
            <Metric
              label="Input"
              value={session.direct ? `${session.direct.inputTokens} tok` : "—"}
            />
            <Metric label="Output" value={session.direct ? "1 readout" : "—"} />
          </dl>
        </article>
        <article className={`${panel} flex flex-col gap-4`}>
          <SectionHeading step="02B / Generation" title="JSON probabilities">
            <Badge variant="outline">Token by token</Badge>
          </SectionHeading>
          <p className="text-sm leading-6 text-muted-foreground">
            Ask the model to estimate the same distribution and write it as
            JSON. Watch the response arrive.
          </p>
          <pre
            aria-label="Generated JSON"
            className="min-h-48 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 font-mono text-xs leading-6 [overflow-wrap:anywhere]"
          >
            {session.text ||
              (session.status === "running"
                ? "Waiting for generated tokens…"
                : "Waiting for a comparison")}
          </pre>
          {session.generation && (
            <p
              className={`text-xs ${session.generation.valid ? "text-muted-foreground" : "text-destructive"}`}
              role="status"
            >
              {session.generation.valid
                ? "Valid distribution · every option is included."
                : `Invalid or incomplete distribution: ${session.generation.error}`}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
            <Metric label="First token" value={seconds(session.firstTokenMs)} />
            <Metric
              label="Total"
              value={seconds(session.generation?.totalMs ?? null)}
            />
            <Metric
              label="Input"
              value={
                session.generation
                  ? `${session.generation.inputTokens} tok`
                  : "—"
              }
            />
            <Metric
              label="Output"
              value={session.text ? `${session.outputTokens} tok` : "—"}
            />
          </dl>
        </article>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Measured wall-time ratio
          </p>
          <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
            {ratio === null
              ? "Run it on your device"
              : `${ratio.toFixed(2)}× generation / direct`}
          </p>
        </div>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Direct runs first, then generation, on the same warmed model. They
          never compete for the GPU. Timings include each method’s prompt
          preparation.
        </p>
      </div>
      <details className={panel}>
        <summary className="cursor-pointer text-sm font-medium">
          How to read these results
        </summary>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
          <p>
            <strong className="text-foreground">
              Conditional probabilities.
            </strong>{" "}
            Direct scores are normalized only over the displayed options. They
            are not calibrated confidence and do not cover every possible
            answer.
          </p>
          <p>
            <strong className="text-foreground">Different methods.</strong> One
            reads a constrained option-token distribution; the other asks the
            model to describe a distribution. Their numbers can differ, and
            generated JSON can be invalid.
          </p>
          <p>
            <strong className="text-foreground">
              Real local measurements.
            </strong>{" "}
            Load, warmup, first-token, and completion timings come from this
            browser. They vary with your hardware and the decision you enter.
          </p>
          <p>
            <strong className="text-foreground">Quantized models.</strong>{" "}
            Smaller weights save memory but can change accuracy. The reference
            benchmarks are not a promise of this browser’s results.
          </p>
        </div>
      </details>
      <footer className="flex flex-wrap justify-between gap-3 pb-2 text-xs text-muted-foreground">
        <span>
          Inspired by{" "}
          <a
            className="underline underline-offset-4"
            href="https://openjev.com/"
            target="_blank"
            rel="noreferrer"
          >
            OpenJev / SemIf
          </a>{" "}
          · adapted for RuaMond
        </span>
        <span className="flex gap-4">
          <a
            className="underline underline-offset-4"
            href={model.homepage}
            target="_blank"
            rel="noreferrer"
          >
            Model details
          </a>
          <a
            className="underline underline-offset-4"
            href="https://github.com/ngxson/wllama"
            target="_blank"
            rel="noreferrer"
          >
            Powered by wllama
          </a>
        </span>
      </footer>
    </section>
  );
}
