# Sentinel v2 — Stack Contract

## Locked Stack (no substitutions without updating this file)

- **Tauri v2** (2.11.2) — desktop shell, native SQLite, global shortcuts, notifications
- **SvelteKit 2 + Svelte 5 runes** — UI framework, file-based routing
- **adapter-static + `ssr = false`** — Tauri serves static files, no SSR
- **TypeScript strict: true** — zero `any`, zero disabled checks
- **SQLite via tauri-plugin-sql native** — NOT WASM, NOT better-sqlite3
- **Drizzle ORM** (sqlite-proxy adapter) — schema types + query builder over tauri-plugin-sql
- **CodeMirror 6** — editor/viewer component, read-only in Phase 1

## Data Directory

`~/Sentinel/events.db` — absolute path, Syncthing-shared root. Never Tauri app-data-relative.

## Banned Libraries

**Never add these — they violate the stack contract:**

- React, react-dom, react-* — use Svelte
- Next.js, @next/* — use SvelteKit
- Tailwind CSS, @tailwindcss/* — use plain CSS or scoped `<style>`
- Express, fastify, Hono — no server-side Node
- Prisma, @prisma/* — use Drizzle ORM
- Any cloud SDK (Firebase, Supabase, AWS, GCP, Azure)
- Any analytics or telemetry (Sentry, PostHog, Mixpanel, Segment, Amplitude)
- @tauri-apps/plugin-sql with wasm variant — use native only

## Architecture Rules

1. **`appendEvent()` is the only write path.** Import from `$lib/db/index.ts`. Direct INSERT calls anywhere else are a violation.
2. **Components dispatch events and read projections** — no business logic in `.svelte` files.
3. **Every new `event_type` goes into the discriminated union** in `src/lib/types/events.ts`.
4. **Drizzle schema and SQL migration schema must stay in sync** — update both when columns change.
5. **Tauri capabilities** in `src-tauri/capabilities/` must be updated when adding new plugins.

## Branch Order (feat/0N-*)

| Branch | Scope |
|--------|-------|
| feat/01-skeleton-and-db | Scaffold, schema, AppEvent union, appendEvent |
| feat/02-sentinel-bar | Always-on-top bar, global shortcut, mode display |
| feat/03-craving-overlay | HALT check, craving log, resolution flow |
| feat/04-daily-note | Daily Markdown note, CodeMirror full edit |
| feat/05-mind-tree | Node/edge graph, linking |
| feat/06-rules-engine | Rule definitions, rule_fired events |
| feat/07-sync | Syncthing health check, conflict detection |
| feat/08-pwa | Phone PWA routes, platform detection |
