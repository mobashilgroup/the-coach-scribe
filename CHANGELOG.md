# Changelog

All notable changes to The Coach Scribe are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Milestone 1 — Backend API core (in progress)

- Established production monorepo (pnpm workspaces): `services/`, `apps/`, `packages/`, `docs/`, `infra/`.
- Preserved the previous PWA under `legacy/pwa-prototype/` as reference only (Spec §32); it is **not** reused architecturally.
- `services/api`: Node + TypeScript + Fastify + Prisma (PostgreSQL) API skeleton.
- Full Prisma data model per Spec §16 with organization / coach isolation.
- Pure domain logic with unit tests:
  - Configurable **plans engine** (limits + feature flags) — Spec §13.
  - **Session state machine** — Spec §17.1.
  - **Usage ledger** accounting — Spec §13.5 (session consumed on entering processing, not on Record).
  - **AI summary JSON schema** validation + controlled repair — Spec §14.3.
  - **Consent** gating rules — Spec §10.11.
  - **Retention** scheduling — Spec §15.4.
  - Swappable **transcription / analysis provider** interfaces with deterministic fakes — Spec §14.6.
- REST endpoints: auth, clients, sessions (+ consent, process), transcript, summary (approve), tasks, goals.
- Strict tenant isolation on every query; JWT auth; centralized error handling.
- `.env.example`, architecture docs, and a runnable local stack (`docker-compose.yml`).

### Milestone 1 follow-up + Milestone 2 start

- **Resumable, chunked upload** with an S3-style storage interface + local-disk
  adapter (Spec §10.14, §15.1): `upload/init`, `upload/:id/chunk/:index`,
  `upload/:id/complete`, with checksum assembly.
- **Export** endpoint (Spec §10.22): JSON download + branded, printable HTML
  (confidentiality notice, client/coach/date).
- **Coach web console** (`apps/web_portal`) — functional black/white/gold app,
  no build step, every action against the real API: register/login, dashboard,
  clients, new session (free text + audio), consent gating, AI review/edit,
  approve, share, history, export.
- **Full workflow verified in a real browser** (Chromium/Playwright), 9 stages
  asserted with screenshots under `apps/web_portal/verification/`.
- API test suite now **52 passing**, including the recording path
  (consent → chunked upload → transcribe+diarize → approve → export).

### Milestone 2 — Fase 2: client portal + messaging

- **Client portal** (Spec §11): single-use, expiring **magic-link** access;
  client-scoped tokens that are rejected on coach endpoints. Endpoints for home,
  shared summaries (only the sections the coach selected), and task progress.
- **Sharing now persists the exact section selection** (`Session.sharedInclude`);
  the portal shows only those sections and **never** the transcript, private
  notes, emotions, or quotes.
- **Messaging + AI reply drafts** (Spec §8.4, §11.6): a client note (optionally
  urgent) triggers a **minimized-context** draft reply for the coach — recent
  approved summaries reduced to summary/topics/goals/actions, with transcript,
  quotes, and emotions stripped. The draft is **never sent automatically**; the
  coach reviews, edits, and sends.
- **In-app notifications** (Spec §25) for new / urgent client messages.
- **Coach Messages UI** + per-client **Invite to portal**, and a standalone
  **client portal page** (`portal.html`) — both wired to the real API.
- New pure unit tests for reply-context redaction; a live-DB E2E of the whole
  portal loop; and a **browser (Playwright) verification** of the Fase 2 flow
  asserting the "never auto-sent" and "transcript-never-shared" guarantees.
- Test suite now **58 passing**.

### Go-live preparation

- **Live AI adapters**: real Deepgram (STT+diarization) + OpenAI (analysis +
  reply drafts) HTTP behind the interfaces, injectable `fetch`, unit-tested;
  fakes stay default until keys are set.
- **Retention worker** (`pnpm worker`): schedules audio deletion on processing
  and executes due audio/transcript deletion with audit; live-DB test.
- **Google OAuth** sign-in (authorization-code flow) + **email** delivery
  (SendGrid adapter, no-op default) — key-guarded.
- **Appointments** CRUD; minimal **admin console** (overview, plan manager, job
  monitor, feature flags, usage) gated by `ADMIN_EMAILS`.
- **Public marketing landing** (`apps/public_website`).
- **Deployment**: `infra/docker/Dockerfile`, `docker-compose.prod.yml`,
  `.dockerignore`, and deployment docs (go-live checklist, env-var table,
  production/staging guides, failure runbook, backup/restore plan).
- New Appointment + Setting models (migrations). Test suite **77 passing**.

### Milestone 3 (start) — Flutter mobile app (scaffolded)

- **`apps/mobile_flutter`**: a real Flutter app wired to the same API — auth,
  dashboard, clients (list+add), new session (record now / free text), recording
  consent, **native microphone recording** (`record`), an **offline upload
  queue** that survives airplane mode and syncs on reconnect
  (`connectivity_plus`), AI review, approve, share, and history. Brand theme
  (black/white/gold), token persistence, configurable API base URL.
- Authored without a Flutter SDK in the environment, so it is **not yet compiled
  or device-verified**; README documents run/verify steps and the native
  background/auto-start-on-unlock roadmap (the reasons the native app exists).
- Also added a Claude (Anthropic) analysis provider and an AssemblyAI
  transcription provider (both env-selectable, key-guarded, unit-tested);
  offline-resilient web recording + installable PWA in `apps/web_portal`.
