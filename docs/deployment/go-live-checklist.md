# Go-live checklist

Everything runs today with safe defaults (fake AI providers, no-op email/push,
in-app notifications, inline processing). To go **live**, provide the items
below and flip the matching env switches. No code changes are required.

## 1. Credentials the owner must create

| Service | Env vars to set | Turns on |
|---|---|---|
| **PostgreSQL** (managed) | `DATABASE_URL` | Persistence (required) |
| **Redis** (managed) | `REDIS_URL`, `QUEUE_DRIVER=bullmq` | Async processing at scale |
| **S3-compatible storage** | `OBJECT_STORAGE_*` | Private media + signed URLs |
| **Analysis** (pick one) | OpenAI: `OPENAI_API_KEY`, `ANALYSIS_PROVIDER=openai` · **or** Claude: `ANTHROPIC_API_KEY`, `ANALYSIS_PROVIDER=claude` | Real AI summaries + reply drafts |
| **Transcription** (pick one) | Deepgram: `DEEPGRAM_API_KEY`, `TRANSCRIPTION_PROVIDER=deepgram` · **or** AssemblyAI: `ASSEMBLYAI_API_KEY`, `TRANSCRIPTION_PROVIDER=assemblyai` | Real transcription + speaker separation |
| **Google OAuth** | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | "Continue with Google" sign-in |
| **Email** (e.g. SendGrid) | `EMAIL_PROVIDER=sendgrid`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` | Email notifications |
| **Push** (FCM/APNs) | `PUSH_PROVIDER=fcm`, `FCM_CREDENTIALS` | Mobile push (adapter to finish) |
| **Sentry** | `SENTRY_DSN` | Error monitoring |
| **Payment gateway** | *(pending decision — see below)* | Paid subscriptions |
| **JWT signing** | `JWT_SECRET` (≥32 chars) or RS256 keys | Auth (required) |
| **Admin access** | `ADMIN_EMAILS` | Platform admin console |

> **Deepgram note:** Deepgram fetches audio from a URL, so live transcription
> requires object storage that can mint short-lived **signed URLs**. On local
> disk the fake provider is used.

## 2. Payment gateway (deferred)

Billing is intentionally **not wired to a specific provider yet** — the plans
engine, subscription records, and usage ledger already exist and are enforced.
When the gateway is chosen (Stripe or an alternative), the work is: a
`BillingProvider` adapter (checkout, customer portal, webhook with idempotency)
behind an interface, plus a `subscriptions` sync. Everything it needs to gate
access is already in place.

## 3. Business decisions to confirm (configurable — see decisions-pending.md)

Final prices, Free-tier shape, retention window (30/90 days), audio-delete
delay, exact model names, launch languages. All live in plan records / env /
feature flags.

## 4. Deploy steps

See `production.md`. In short: set `.env`, run migrations
(`prisma migrate deploy`), seed plans, start `api` + `worker`, point
`app.thecoachscribe.com` → api, serve `apps/public_website` at the apex domain.

## 5. Pre-launch verification

- `pnpm --filter @tcs/api test` green (unit + live-DB E2E).
- Browser smoke: `apps/web_portal/verification/verify-workflow.mjs` and
  `verify-portal.mjs` against staging.
- Confirm `/health` returns ok; confirm a real session processes end-to-end with
  live keys on staging before switching production.
