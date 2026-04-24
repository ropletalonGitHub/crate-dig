# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Development:
- `npm run tauri dev` — launch the desktop app (recommended; wraps the Vite server in the native shell)
- `npm run dev` — run the Vite dev server alone (frontend + embedded API, no Tauri shell)
- `npm run build` — type-check (`tsc`) then produce a production Vite build

Database (Drizzle + Postgres):
- `npm run db:push` — apply `src/db/schema.ts` to the database named in `DATABASE_URL`
- `npm run db:studio` — open Drizzle Studio

Library maintenance (Node CLI scripts under `scripts/`, run via `tsx`):
- `npm run scan` — walk `MUSIC_ROOT`, read tags, upsert tracks, flag missing files
- `npm run import-charts` — import external chart lists
- `npm run fix-genres` — rewrite genres via the canonical taxonomy

Environment: `.env` must define `DATABASE_URL` (Postgres) and `MUSIC_ROOT` (absolute path to the mounted library, e.g. `/Volumes/music`).

There is no test suite or linter configured in this repo.

## Architecture

### Tauri 2 shell with Vite-embedded API

The app is a single-user macOS desktop app. The Rust side (`src-tauri/`) is a thin shell around the Vite-served React frontend. There is **no separate backend process** — the HTTP API is served as Vite middleware.

`vite.config.ts` registers an `apiPlugin` that `ssrLoadModule`s `src/server/api.ts` on each `/api/*` request. Consequences:
- API handlers have direct access to `db` from `src/db/client.ts`; no RPC layer
- The API only exists while the dev/Vite server is running — the production Tauri build would need a different host for `handleApi` before it could ship
- `src/api.ts` (frontend) and `src/server/api.ts` (backend) are the contract; keep them in sync

### Data model

Schema in `src/db/schema.ts`. Key tables and relationships:
- `tracks` — one row per audio file on disk (keyed by `path`); `missing_at` flags files not seen on the last scan rather than deleting them, so NAS downtime is non-destructive
- `artists`, `albums`, `genres` — normalized lookup tables, referenced by `tracks`
- `genres.norm_key` is a unique canonical key (lowercase, NFD, diacritics stripped) — the scanner looks up genres by this to avoid case/accent duplicates. Canonical forms live in `src/db/genre-taxonomy.ts`
- `types` is a **separate axis from genre** (e.g. workout/chill/party); many-to-many via `track_types`
- `tags` are free-form user labels (many-to-many via `track_tags`)
- `ratings` (0–5 stars + independent `favorite` bool) is keyed by `track_id` (one row per rated track)
- `charts` + `chart_entries` hold external ranking lists; `track_charts` is the resolved join after matching by normalized artist/title
- `play_history` is append-only; `/api/recent` aggregates `max(played_at)` + `count(*)` per track

### Scanner (`scripts/scan.ts`)

Walks `MUSIC_ROOT` recursively, reads tags via `music-metadata`, upserts into Postgres. Incremental: skips rows where `(path, mtime, size)` match. After walking, rows whose paths weren't seen get `missing_at = now()`.

Two safety guards prevent mass-flagging when the SMB mount drops: it refuses to start if the root is missing/empty, and it skips `markMissing` if the walk yielded zero files.

### Frontend state (Zustand — `src/store.ts`)

Single store holds navigation, filters, playback queue, and a revision counter.
- **Navigation stack**: `stack[stack.length-1]` is the current route. `setRoot` resets the stack (used by Library/Recent tabs); `push` pushes (used by artist/album links); `back` pops
- **Playback queue**: `queue` is the ordered list; `currentIndex` points at the now-playing track. `playList(list, idx)` replaces the queue; `enqueue(t)` appends. `NowPlaying` owns the `<audio>` element and reacts to `currentIndex` changes
- **Revision counter**: mutations that change what the track list shows (`saveRating`, type/tag edits) call `bumpRevision()`. Components with data fetches include `revision` in their `useEffect` dependency array to refetch. This is how the UI stays consistent without a cache layer

### Variant grouping

`TrackTable` collapses same-song-different-versions (live takes, remasters, etc.) into a single expandable row. Grouping key is `variantKey(artist, title)` from `src/lib/norm.ts`; representative is chosen by `scoreVariant` (favorite → stars → best chart rank → bitrate → id). Controlled by the `groupVariants` filter.

### Audio streaming

`/api/file?id=X` streams the file via `createReadStream` with HTTP range support (the `<audio>` element uses this for seeking). Content-type is inferred from the path extension.

### Theming (`src/theme.ts` + Tailwind)

Light/dark themes work by **remapping the Tailwind `neutral-*` palette to CSS variables**, not by adding `dark:` variants everywhere. `tailwind.config.js` declares `neutral-50..950` as `rgb(var(--neutral-N) / <alpha-value>)`; `src/index.css` defines the two palettes — light mode inverts the scale so existing classes like `bg-neutral-950` and `text-neutral-100` stay meaningful. An inline script in `index.html` applies the stored theme before React mounts to avoid a flash. When writing new components, keep using `neutral-*` utilities; avoid hardcoded hex colors.
