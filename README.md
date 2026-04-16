# crate-dig

A DJ-style desktop music library manager built for large personal collections stored on a NAS.

Browse, filter, rate, and play your music from a fast native app — no cloud, no subscriptions, your files stay yours.

## Features

- **Fast library scanning** — reads ID3/metadata tags from mp3, m4a, flac, wav files on a mounted SMB share
- **Faceted browsing** — filter by genre, type (workout, chill, party...), year range, rating, favorites, and custom tags
- **Sortable track table** — virtualized for smooth scrolling through thousands of tracks
- **Playback** — built-in audio player with play/pause, seek, volume, and queue management
- **Ratings & favorites** — 0–5 star ratings plus a separate favorite flag
- **Custom tags** — free-form crate labels for organizing tracks your way
- **Play history** — track what you've been listening to
- **Global search** — search across titles, artists, and albums
- **Offline-first** — works even when NAS is temporarily unavailable (missing files are flagged, not deleted)

## Tech stack

| Layer | Technology |
|-------|------------|
| Shell | [Tauri 2](https://v2.tauri.app/) (Rust backend, native macOS window) |
| Frontend | React + TypeScript + Tailwind CSS (via Vite) |
| Database | PostgreSQL (local) + [Drizzle ORM](https://orm.drizzle.team/) |
| Audio | [Howler.js](https://howlerjs.com/) |
| Tag reading | [music-metadata](https://github.com/borewit/music-metadata) |
| State | [Zustand](https://zustand.docs.pmnd.rs/) |

## Prerequisites

- **Node.js** 20+
- **Rust** (via [rustup](https://rustup.rs/))
- **PostgreSQL** 16 (e.g. [Postgres.app](https://postgresapp.com/) on macOS)
- Music files accessible via a mounted SMB share (default: `/Volumes/music`)

## Getting started

```bash
# Clone the repo
git clone https://github.com/ropletalonGitHub/crate-dig.git
cd crate-dig

# Install dependencies
npm install

# Set up environment
cp .env.example .env   # then edit with your database URL

# Apply database schema
npm run db:push

# Launch the app
npm run tauri dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri dev` | Start the Tauri desktop app in dev mode |
| `npm run dev` | Start Vite dev server only (no Tauri shell) |
| `npm run build` | TypeScript check + production build |
| `npm run db:push` | Apply Drizzle schema to the database |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npm run scan` | Run the library scanner from CLI |

## Project structure

```
src/                  # React frontend
  components/         # UI components (TrackTable, Sidebar, NowPlaying, ...)
  db/                 # Drizzle schema & client
  server/             # API layer
  store.ts            # Zustand state management
src-tauri/            # Tauri / Rust backend
scripts/              # CLI utilities (scanner, importers)
```

## License

[MIT](LICENSE)
