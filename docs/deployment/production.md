# Production deployment

## Option A — Docker Compose (single host)

```bash
cp .env.example .env         # fill real values (see go-live-checklist.md)
docker compose -f docker-compose.prod.yml up -d --build
# `migrate` applies migrations, then `api` (:4000) and `worker` start.

# Seed the plan catalogue once:
docker compose -f docker-compose.prod.yml run --rm api pnpm exec tsx prisma/seed.ts
```

The `api` service also serves the coach web app at `/app/` (`WEB_DIST_DIR`).
Serve `apps/public_website/` at the apex domain via any static host/CDN.

## Option B — Managed platform (recommended for scale)

- **Database:** managed PostgreSQL 16; set `DATABASE_URL`.
- **Cache/queue:** managed Redis; set `REDIS_URL`, `QUEUE_DRIVER=bullmq`.
- **Storage:** S3-compatible bucket (private) with signed URLs; `OBJECT_STORAGE_*`.
- **API:** container from `infra/docker/Dockerfile`, command
  `pnpm exec tsx src/server.ts`, health check `/health`.
- **Worker:** same image, command `pnpm exec tsx src/worker.ts`.
- Run `prisma migrate deploy` as a release/pre-deploy step.

## Domains

| Host | Serves |
|---|---|
| `thecoachscribe.com` | `apps/public_website` (static) |
| `app.thecoachscribe.com` | coach web app + API (`/app`, `/v1`, `/health`) |

## Build → verify → cut over

1. Deploy to **staging** with real keys on staging providers.
2. `pnpm --filter @tcs/api test` (unit + live-DB E2E) green.
3. Run the browser smokes (`verify-workflow.mjs`, `verify-portal.mjs`) at staging.
4. Process one real session end-to-end with live Deepgram/OpenAI on staging.
5. Promote the image to production; run `migrate deploy`; verify `/health`.

## Hardening before public launch

RS256 JWTs + key rotation, rate limiting, WAF, at-rest encryption for stored
files and OAuth tokens, backups (see `backup-restore.md`), Sentry, and the
payment gateway (see `go-live-checklist.md`).
