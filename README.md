# RADIO AI

A live AI radio broadcast system. A persona-driven host generates scripts on a schedule, the lines are routed through an LLM-based moderation pass and a ComfyUI text-to-speech pipeline, and listeners hear the result in real time over WebSocket — with a listener-facing message wall and a full admin console for managing personas, topics, news sources, and message moderation.

## Architecture at a glance

```
┌──────────────────────┐    HTTP     ┌─────────────────────┐    WebSocket    ┌──────────────┐
│  Next.js (port 3000) │ ──────────▶ │  ws-server (8080/   │ ──────────────▶ │  Listener UI │
│  - app/              │             │   8081)             │                 │  /           │
│  - admin console     │ ◀────────── │  - /audio  audio fan-out            │              │
│  - API routes        │  broadcast  │  - /messages  message fan-out       │              │
└──────────┬───────────┘             └─────────────────────┘                 └──────────────┘
           │                                       ▲
           │                       ┌───────────────┴────────────────┐
           │                       │  External services             │
           ▼                       │  - LLM (OpenAI-compatible API) │
┌──────────────────────┐            │  - ComfyUI + OmniVoice TTS     │
│  Prisma + SQLite     │            └────────────────────────────────┘
│  (dev.db)            │
└──────────────────────┘
```

- **`src/app/`** — Next.js 15 App Router. `page.tsx` is the listener page; `admin/` is the management console; `api/` is the server-side routes.
- **`src/lib/`** — Domain modules: `live-engine` (broadcast orchestration), `llm` (script generation), `moderation` (AI message filtering), `comfyui` (TTS workflow submission + polling), `news` (RSS + Tavily), `prisma` (DB client).
- **`ws-server/`** — Standalone Node WebSocket fan-out server. Listens on `8080` (WS) and `8081` (HTTP broadcast endpoint used by Next.js routes).
- **`prisma/`** — Schema and migrations. The local SQLite DB is at the repo root as `dev.db` (gitignored).

## Prerequisites

- Node.js 20+
- A running ComfyUI instance with the OmniVoice TTS nodes (used by the workflows in `workflows/`)
- An OpenAI-compatible LLM endpoint (configured per-deployment in the admin console)

## Setup

```bash
npm install
npx prisma migrate deploy     # apply migrations to dev.db
npm run dev                   # Next.js on :3000
```

In a second terminal:

```bash
npx tsx ws-server/index.ts    # WebSocket fan-out on :8080, HTTP broadcast on :8081
```

Open <http://localhost:3000> for the listener page, <http://localhost:3000/admin> for the admin console.

### Environment

The only required env var is `DATABASE_URL` (already set in `.env` to point at the local SQLite file). For production deployments, also set:

- `ADMIN_PASSWORD` — required, no default. The admin login route returns 503 if this is unset or shorter than 8 characters.
- `WS_PORT` / `WS_HTTP_PORT` — defaults 8080 / 8081, change if those are taken.

LLM endpoint, ComfyUI server URL, and ComfyUI token are configured at runtime through the admin console (stored in the DB), not via env vars.

## What's in the admin console

- **主题 (Topics)** — Define radio themes, each pairing a `Persona` (the host's voice and character) with a `Workflow` (the ComfyUI TTS pipeline). Themes can be activated/deactivated; only one is active at a time.
- **人物 (Personas)** — Host characters: name, system prompt, themes they're used in.
- **工作流 (Workflows)** — ComfyUI TTS workflow JSONs, plus optional reference audio + reference text for voice cloning.
- **新闻 (News)** — RSS source management, automatic fetching on a configurable schedule, Tavily integration for live web search.
- **留言管理 (Messages)** — Listener-submitted messages. AI moderation queues them as `pending`/`approved`/`rejected`. Admin can approve, reject, hide, or delete. Configurable cap (`maxVisibleMessages`), scroll speed, and front-end visibility toggle.
- **音频缓冲 (Audio buffer)** — Tune prebuffer behavior (sentence count, seconds, mode) for low-latency playback.
- **LLM / ComfyUI 配置** — Set the API URL, key, and model name; ComfyUI server URL, token, and webhook URL. All persisted to the DB.

## Listener page features

- **Message wall** — Auto-scrolling wall of approved listener messages. Settings (max visible, scroll speed, visibility) are managed in the admin console and propagate live.
- **Message input drawer** — Submit a message; goes through the moderation pipeline; appears on the wall once approved.
- **Real-time audio** — Streaming playback over WebSocket; auto-plays once the user clicks through the entry overlay (browser autoplay policy requires a user gesture).
- **Live TTS** — Generated sentences stream from the live engine through ComfyUI; a prebuffer is maintained so playback stays smooth.

## Project layout

```
src/
  app/
    page.tsx                    # Listener page
    admin/                      # Admin console
    api/                        # Server-side routes
    listen/                     # (alt entrypoint)
  components/                   # RadioPlayer, MessageWall, etc.
  config/                       # Single-row DB-backed config helpers
  lib/
    comfyui/                    # ComfyUI workflow submit + poll
    live-engine/                # Orchestrator: LLM → TTS → broadcast
    llm/                        # OpenAI-compatible chat client
    moderation/                 # LLM-based message filter
    news/                       # RSS + Tavily
    prisma/                     # Prisma client
ws-server/index.ts              # Standalone WS fan-out server
prisma/
  schema.prisma
  migrations/
workflows/
  my_omnivoice-tts_api.json
  my_omnivoice-tts_clone_api.json
```

## Development notes

- This is **Next.js 16**, not 15. The `AGENTS.md` file in this repo warns that conventions may differ from prior versions. Read `node_modules/next/dist/docs/` before making structural changes.
- Prisma 7 client is generated to `src/generated/prisma` (gitignored). Run `npx prisma generate` after schema changes.
- The SQLite DB (`dev.db`) is gitignored. For production, swap the `DATABASE_URL` to a managed DB; the schema uses generic types so the migration is mostly portable, but `provider = "sqlite"` in `prisma/schema.prisma` needs to change.
- A 2-step process (Next.js + `ws-server`) is required because the WebSocket fan-out is decoupled from the Next.js server. Both must be running for the listener page to work.
- Tests live in `src/__tests__/`. `vitest.config.ts` and `jest.config.ts` are both present — check which one each test file targets (`*.test.ts` vs `*.test.tsx`).

## License

MIT
