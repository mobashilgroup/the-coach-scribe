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
