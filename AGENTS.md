# AGENTS.md

You are a codex running on a headless Debian server.

## Scope
- Treat this repository root as a standalone frontend workspace.
- Do not edit files outside this repository unless the user explicitly asks.

## Project Overview
- Project: standalone Vite + React + TypeScript single-page application copied from `../MockerPI/ui`.
- UI stack: Tailwind CSS, Radix UI primitives, shadcn-style component patterns, and lucide icons.
- Content rendering: MDX through `@mdx-js/rollup` and `@mdx-js/react`.
- The app has no local workspace package dependency; do not reintroduce `../common` or `@common`.

## Build And Test Commands
Run commands from the repository root:

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build`
- Preview production build: `npm run preview`
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Format code: `npm run format`

## Code Style Guidelines
- Language: TypeScript (`.ts`/`.tsx`) with explicit types for props, API payloads, and state where practical.
- Imports: Use `@/` for `src/*`.
- React: use function components and hooks.
- Styling: use Tailwind utilities and shared primitives from `src/components/ui/*`.
- Keep global style changes limited to `src/index.css` and `src/mdx.css`.

## Runtime Notes
- Client-facing environment variables must use the `VITE_` prefix.
- `VITE_WEBSITE_LINK` controls the sidebar brand link; it falls back to `#`.
- Backend API calls such as `/api/projects` are runtime expectations and are not implemented in this repo.

## Security Considerations
- Do not commit secrets or real `.env` files.
- Do not expose raw `process.env` to browser code.
- Sanitize or validate untrusted uploaded/API content before rendering.

## Required Living Docs
- Keep `ARCHITECTURE.MD` current when structure, dependencies, or data flow changes.
