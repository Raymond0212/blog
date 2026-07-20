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
- `src/features/hidock/*`: HiDock Manager page, services, types, and utilities.
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
- HiDock services use browser capabilities including WebUSB and File System Access when available.
- The E-Paper Designer keeps its layout in page-local React state. A pure renderer converts Text Box, Text Area, List Area, and Region components into a 1-bit 200 × 200 pixel buffer; Regions own fully contained ordinary components, which inherit their bitmap font and compose inversion with the parent background. The visible canvas is an integer-scaled preview with editor overlays that are excluded from export. Layout XML is parsed and downloaded entirely in the browser, with no backend or persistent draft storage.

## 7. Quality Gates
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## 8. Security And Risk Notes
- Do not reintroduce whole-environment browser injection.
- Keep `.env` files out of git; only `.env.example` is tracked.
- Validate uploaded OpenAPI/Swagger payloads and untrusted API data before display.
