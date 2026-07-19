# Security & privacy (Milestone 1 posture)

Implements the load-bearing controls from Spec §24; the rest are scheduled.

## Enforced now
- **Tenant isolation (§16.2):** every query filters by `organizationId`; the
  helpers in `src/lib/context.ts` are the single chokepoint. A `clientId` /
  `sessionId` from the client is verified against the caller's org before use.
  Cross-tenant reads return **404** (existence hidden), not 403.
- **Secrets only server-side (§19.5):** validated at boot in `src/config/env.ts`.
  No provider keys are ever shipped to a frontend. The legacy PWA's frontend
  keys are quarantined under `legacy/` and flagged for rotation.
- **Consent gate (§10.11):** recordings cannot be processed without a valid,
  current, un-revoked consent.
- **No auto-share (§8, §14.5):** the session state machine makes
  `review_required → shared` impossible; a human `approve` is required first.
- **Password hashing:** bcrypt (cost 12). Neutral auth error messages (§10.2).
- **Minimized logging (§24.2):** request bodies (transcripts, notes, prompts)
  are never logged; audit logs store actions and ids, not content (§24.6).
- **Input validation:** every route body/query validated with Zod.

## Scheduled (next milestones)
- Refresh-token rotation + revocation, MFA, device/session list.
- Rate limiting, CSRF for cookie flows, malware scan on uploads.
- At-rest encryption of files and OAuth tokens; KMS-managed master key.
- RS256 JWTs with key rotation (HS256 secret is dev-only).
- Retention worker that executes the scheduled deletions computed in
  `src/domain/retention/`.
