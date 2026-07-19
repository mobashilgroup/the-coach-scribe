# Data model

The authoritative schema is [`services/api/prisma/schema.prisma`](../../services/api/prisma/schema.prisma)
(Spec §16). Highlights:

## Tenancy
`User` ↔ `Organization` via `Membership` (role: owner/admin/coach/support).
Every tenant-scoped row carries `organizationId`; access is filtered by org +
coach permission in the service layer (§16.2). `CoachClientLink` supports
multiple authorized coaches per client in an organization.

## Core coaching entities
- `Client` — org-scoped, soft-archived (`archivedAt`).
- `Consent` — per-session or carried-over; stores text version, method, evidence.
- `Session` — the state machine subject (see below); `inputMethod`,
  `languageSpoken` vs `outputLanguage`, `freeText`.
- `SessionFile` — media with `checksum`, `encrypted`, `retentionDeleteAt`.
- `TranscriptSegment` / `Speaker` — diarized transcript, editable.
- `Marker` — insight/task/goal markers with timestamps.
- `Summary` — **versioned** `content_json` (never overwritten), `status`,
  `modelProvider`, `promptVersion`, `approvedBy/At`.
- `ActionItem` / `Goal` — with `visibility` (private until shared).
- `ClientMessage` / `AiReplyDraft` — Fase 2 tables, present in schema.

## Billing & ops
`Plan` (limits_json / features_json — the configurable plans engine),
`Subscription`, `UsageLedger` (append-only), `Payment`, `Integration`,
`Notification`, `AuditLog` (actions + ids, never sensitive content).

## Session lifecycle (§17.1)
```
draft → consent_pending → consented → recording|uploading → uploaded
     → transcribing → transcription_ready → summarizing → review_required
     → approved → shared → archived
parallel: failed_upload, failed_transcription, failed_summary, cancelled, deleted
```
Enforced in `src/domain/sessions/state-machine.ts`; illegal transitions throw.
