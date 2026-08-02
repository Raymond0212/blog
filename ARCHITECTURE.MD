# ARCHITECTURE.MD

Living architecture reference for agents and contributors working in this standalone frontend repo.

## 1. Purpose

- Provide a rapid mental model of the copied UI app.
- Reduce architectural drift after the transplant from `../MockerPI/ui`.
- Update this file whenever module boundaries, core dependencies, or data flow change.

## 2. Tech Stack

- Runtime/build: Vite 5, TypeScript 5, React 18.
- Styling/UI: Tailwind CSS, Radix UI primitives, shadcn-style components in `src/components/ui/*`, and `lucide-react`.
- Content: MDX via `@mdx-js/rollup` and `@mdx-js/react`, with fenced code highlighting via `rehype-highlight`.
- Forms/validation: `react-hook-form`, `@hookform/resolvers`, and `zod`.
- Feature utilities: WebUSB/File System Access APIs for HiDock, `@huggingface/transformers`, `recharts`, `sonner`, and supporting UI packages.

## 3. Build-Time Architecture

- Entry config: `vite.config.ts`.
- Output directory: `dist`.
- Aliases:
  - `@` -> `src`.
- Compile-time globals:
  - `__APP_VERSION__` from the npm package version, used by the app version guard.
- Client environment:
  - Use Vite-prefixed variables only, such as `VITE_WEBSITE_LINK`.
  - Raw `process.env` is not injected into browser code.

## 4. Runtime Topology

- `src/main.tsx` mounts `<App />` and global styles.
- `src/App.tsx` wraps `ThemeProvider` and `MenuItemProvider`.
- `src/Page.tsx` composes the sidebar shell and main workspace.
- `src/data/MenuItems.tsx` defines static menu nodes plus build-time article discovery (`src/content/articles/**/*.mdx`), id-based component/icon resolution, and index/visibility helper functions.
- `src/MyComponents/MainContentComponents/MainContent.tsx` renders the selected menu component through the MDX provider.

## 5. Key Folders

- `src/components/ui/*`: reusable UI primitives.
- `src/components/*`: app-level shared UI such as sidebar sections and theme controls.
- `src/MyComponents/*`: copied feature/page components from the original UI.
- `src/features/hidock/*`: HiDock Manager page, services, types, utilities, local workspace filtering/safety policy, and the pure Jensen protocol layer. The supported implementation and hardware-validation scope is the HiDock P1 Mini only; identifiers and protocol metadata for other models are compatibility references, not supported feature targets.
- `src/features/hidock/jensen/*`: HiNotes-compatible product mapping, bounded frame codec, serialized command scheduler, capability policy, and response parsers. These modules are browser-independent and covered by parity tests.
- `src/features/embedding/*`: frontend-only multi-sentence contextual embedding demo using a matched Hugging Face WordPiece tokenizer and quantized MiniLM model in a Web Worker, plus client-side PCA and animated canvas rendering.
- `src/features/epaper-designer/*`: browser-only 200 × 200 monochrome UI designer with exact Spleen 2.2.0 printable-ASCII bitmap data, fixed-cell component geometry, nested Regions, list pagination, and versioned XML import/export.
- `src/data/*`: menu model and React context provider.
- `src/content/*`: MDX content modules.
  - `src/content/articles/**`: auto-discovered article pages grouped by first-level folder.
- `src/types/*`: app API/domain types.
- `public/*`: static assets.

## 6. State And Data Flow

- Local UI state is held in React component state.
- Menu state is held in `MenuItemProvider` as immutable runtime state (`selectedId`, `expandedIds`) and persisted in `localStorage` under `menu-context`.
- Article pages are discovered via `import.meta.glob` and merged into a dynamic top-level `Articles` menu node at startup.
- Article menu ids are path-based (`article:<relative-path-without-ext>`) so selection persistence survives label changes.
- Article ordering: dated files using `ddmmyy-` prefix sort newest-first within a folder; undated files sort alphabetically.
- Sidebar rows are derived from menu tree + expanded state as a flattened visible list to avoid nested rerender costs on long menus.
- Persisted menu state is validated against current menu ids; invalid selections fall back to `Home`.
- Theme state is persisted by the theme provider.
- The Embedding Demo downloads and caches `onnx-community/all-MiniLM-L6-v2-ONNX`, independently embeds up to eight user-provided sentences with its paired tokenizer and quantized transformer in a Web Worker, reduces all contextual token and sentence vectors to one shared three-dimensional PCA projection, and finds the three nearest user tokens by Euclidean distance in that displayed space; it has no predefined comparison vocabulary or backend dependency.
- App version changes clear `localStorage` and `sessionStorage`, then write `app_version`.
- Backend interactions use direct `fetch` calls to runtime endpoints such as `/api/projects` and `/api/upload-openapi`.
- HiDock services use browser capabilities including WebUSB and File System Access when available. `WebUsbDeviceService` owns WebUSB configuration and connection state, while the Jensen layer owns wire framing, one-command-at-a-time scheduling, streamed response completion, firmware/model gates, and binary parsing. React subscribes to transport state and derives action availability from the shared capability policy. `local-workspace.ts` provides the HiNotes-inspired local Notes/Whispers views, recording MIME detection, and the default-on safety-lock policy: reads, downloads, disconnects, and stop/exit actions remain available, while setting changes, device-mode entry, and destructive commands require the user to unlock the page and then confirm the individual action. The HiDock page has no cloud upload action.
- The HiDock workspace is divided into `Recordings`, `Live Recording`, `Configurations`, and `Device Tools` tabs under a persistent status bar. Every tab participates in the app shell's `min-width: 0` flex chain; phone layouts stack live-monitor controls and contain raw Device Tools output so tab content cannot widen the viewport. A single explicit activity state prevents recording, transfer, playback, and realtime monitoring from competing for the serialized WebUSB transport. Recording status is polled once per second outside transfer/realtime activities; a completed device recording refreshes and highlights the new file without transferring it.
- Configurations reads the current audio input source from the P1 Mini and displays it as device-reported status only. The browser service and UI expose no audio-input setter or source-selection action, leaving source selection entirely under device control.
- Browser playback and downloads share the same cancellable Jensen file-transfer loop. Recordings use a compact card list on phones and a table from the medium breakpoint upward; both layouts expose the same icon-only play/stop control and trailing actions menu for one-file download or safety-confirmed deletion, without multi-selection state. Playback holds only the current completed transfer as an in-memory `Blob` URL (`.mp3`/`.hda` as MPEG audio and `.wav` as WAV); replacement, cancellation, disconnect, and component cleanup abort the transfer and revoke the URL. No transferred audio is cached or uploaded.
- The experimental realtime monitor starts Jensen realtime mode 2 and polls its eight-byte status prefix every 50–100 ms. The remaining interleaved PCM16LE framing is decoded at 16 kHz, collapsed to the stronger mono input, high-pass filtered, and passed through an adaptive noise gate. The same processed mono samples feed a gain-controlled `AudioContext` monitor and an in-memory capture; stopping produces a downloadable mono PCM WAV without writing a recording to the P1 Mini. Five consecutive read failures, disconnect, leaving the tab, or cleanup stop the polling loop, release audio nodes/context, and attempt `stopRealtime`.
- Automated tests validate the protocol logic with simulated transports, including shared transfer success/short-read/cancellation behavior, MIME selection, realtime framing/PCM conversion, recording firmware gates, and factory-reset confirmation. Physical P1 Mini validation on firmware 2.3.1 covers connection and identification, file listing and download, duration conversion, read-only device/card/settings/Bluetooth/recording queries, command serialization, and clean disconnect/reconnect. It also confirms that P1 Mini device-info serials may omit null padding and that WebUSB-timeout commands are unsupported. Destructive actions remain intentionally untested. No physical-device validation or feature support is required for other HiDock models.
- The E-Paper Designer keeps its layout in page-local React state. A pure renderer converts Text Box, Text Area, List Area, and Region components into a 1-bit 200 × 200 pixel buffer; Regions own fully contained ordinary components, which inherit their bitmap font and compose inversion with the parent background. The visible canvas is an integer-scaled preview with editor overlays that are excluded from export. Layout XML is parsed and downloaded entirely in the browser, with no backend or persistent draft storage.

## 7. Quality Gates

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 8. Security And Risk Notes

- Do not reintroduce whole-environment browser injection.
- Keep `.env` files out of git; only `.env.example` is tracked.
- Validate uploaded OpenAPI/Swagger payloads and untrusted API data before display.
