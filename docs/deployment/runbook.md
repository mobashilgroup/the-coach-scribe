# Failure runbook

General: the API logs structured JSON (no request bodies — transcripts/notes/
prompts never appear in logs). Check `/health` first; check the `worker` logs
for retention/queue issues.

| Symptom | Likely cause | Action |
|---|---|---|
| API won't boot, "Invalid environment configuration" | missing/short `JWT_SECRET`, missing `DATABASE_URL`, or a real provider selected without its key | Fix `.env` per `env-vars.md`; the error lists the exact fields. |
| 500s on all requests | DB unreachable | Verify `DATABASE_URL`, network, `pg_isready`; check pool limits. |
| Sessions stuck in `transcribing`/`summarizing` | AI provider error or bad audio URL | Check logs; the session moves to `failed_transcription`/`failed_summary` and **usage is refunded** (§13.5). Retry via `POST /v1/sessions/:id/retry`. |
| "Deepgram requires an http(s) media URL" | storage can't mint signed URLs | Configure S3 storage + signed URLs, or use the fake provider. |
| Transcription/summary fails repeatedly | provider outage/quota | Fake fallback for triage; switch `*_PROVIDER` or model; recording is never lost. |
| Upload fails / 413 | chunk exceeds limit | Chunks are capped at 12 MB; client should split smaller. |
| Client can't open portal ("link invalid or expired") | single-use link already used or >72h old | Re-issue via `POST /v1/clients/:id/invite`. |
| Audio not being deleted | worker not running | Ensure the `worker` process is up; check `RETENTION_SWEEP_SECONDS`; sweeps are audited (`retention.audio_deleted`). |
| Admin endpoints 403 | email not in allowlist | Add to `ADMIN_EMAILS` and restart. |
| Google sign-in 501 | not configured | Set all three `GOOGLE_*` vars. |

## Escalation data to capture
- `reqId` from the API log line, session id, and the failing endpoint.
- Never copy transcript/summary content into tickets; reference ids only.

## Recovery principles (Spec §28)
- A recording is never destroyed by a downstream failure.
- System failures refund quota; user retries re-enter the pipeline.
- Payment failures keep read access during a configurable grace period.
