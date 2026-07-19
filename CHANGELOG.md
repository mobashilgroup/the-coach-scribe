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
