# Environment variables

Validated at boot in `services/api/src/config/env.ts`; the API fails fast on a
bad/missing required value. Secrets live only in the API/worker tier — never in
any frontend bundle. Full example: root `.env.example`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_ENV` | no | development | development/staging/production/test |
| `PORT` | no | 4000 | API port |
| `APP_URL` | no | http://localhost:3000 | Base URL for magic links etc. |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection |
| `REDIS_URL` | for queue | — | Redis (BullMQ) |
| `QUEUE_DRIVER` | no | inline | inline \| bullmq |
| `OBJECT_STORAGE_*` | for prod media | — | S3-compatible storage |
| `STORAGE_DIR` | no | .storage | Local disk storage (dev) |
| `JWT_SECRET` | **yes** | — | Access/portal token signing (≥32 chars) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | 900 / 2592000 | Token lifetimes (s) |
| `TRANSCRIPTION_PROVIDER` | no | fake | fake \| deepgram |
| `ANALYSIS_PROVIDER` | no | fake | fake \| openai |
| `DEEPGRAM_API_KEY` / `DEEPGRAM_MODEL` | if deepgram | — / nova-2 | STT |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | if openai | — / gpt-4o | Analysis + reply drafts |
| `EMAIL_PROVIDER` | no | noop | noop \| sendgrid |
| `EMAIL_PROVIDER_API_KEY` / `EMAIL_FROM` | if sendgrid | — | Email delivery |
| `PUSH_PROVIDER` | no | noop | noop \| fcm |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | for Google sign-in | — | OAuth (all three required) |
| `CONSENT_TEXT_VERSION` | no | v1 | Bump when consent text changes |
| `DEFAULT_RETENTION_DAYS` | no | 90 | Transcript retention window |
| `AUDIO_DELETE_AFTER_HOURS` | no | 24 | Delete audio after processing |
| `RETENTION_SWEEP_SECONDS` | no | 3600 | Worker sweep cadence |
| `MAX_SESSION_MINUTES` | no | 60 | Per-session cap (also per-plan) |
| `ADMIN_EMAILS` | for admin | "" | Allowlist for `/v1/admin/*` |
| `SENTRY_DSN` | no | — | Error monitoring |
