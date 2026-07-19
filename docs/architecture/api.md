# API reference (Milestone 1)

Base URL: `/`. All responses are JSON. Errors use `{ "error": { "code", "message" } }`.
Auth is a Bearer access token (`Authorization: Bearer <token>`) obtained from
register/login. Every data route is scoped to the caller's organization.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/v1/auth/register` | `email, password, firstName, acceptedTerms:true, [organizationName,...]` | Creates user + org + owner membership, assigns Free Trial, returns `accessToken`. |
| POST | `/v1/auth/login` | `email, password` | Returns `accessToken`. Neutral error on bad credentials. |

## Clients
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/clients` | `?includeArchived=true` optional. Org-scoped list. |
| POST | `/v1/clients` | Enforces plan client cap (402 `client_limit_reached`). |
| GET | `/v1/clients/:id` | 404 if outside org (existence hidden). |
| PATCH | `/v1/clients/:id` | Partial update. |
| DELETE | `/v1/clients/:id` | Soft-archive (sets `archivedAt`). |

## Sessions
| Method | Path | Notes |
|---|---|---|
| POST | `/v1/sessions` | `clientId, inputMethod, [freeText, outputLanguage, durationSeconds,...]`. Starts in `draft`. |
| GET | `/v1/sessions` | `?clientId`, `?status`. Excludes deleted. |
| GET | `/v1/sessions/:id` | Returns session + latest summary + transcript + speakers. |
| POST | `/v1/sessions/:id/consent` | `{ confirmed:true, method? }`. Records consent → `consented`. |
| POST | `/v1/sessions/:id/process` | Runs transcription+analysis; consent+quota gated; ends in `review_required`. |
| POST | `/v1/sessions/:id/retry` | Re-enter pipeline from a failure state. |

## Summary & transcript
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/sessions/:id/summary` | Latest version. |
| PATCH | `/v1/sessions/:id/summary` | Coach edit → new version, validated/repaired against schema. |
| POST | `/v1/sessions/:id/summary/approve` | Human approval → `approved`. Required before sharing. |
| POST | `/v1/sessions/:id/share` | `{ include:{...}, channel }`. Only from `approved` (409 otherwise). Transcript off by default; private notes never shareable. |

## Tasks & goals
| Method | Path | Notes |
|---|---|---|
| GET | `/v1/tasks` | `?clientId`, `?status`. Org-scoped. |
| PATCH | `/v1/tasks/:id` | Update status/fields. |
| GET | `/v1/goals` | `?clientId`. |
| PATCH | `/v1/goals/:id` | Update status/progress. |

## Error codes
`validation_error` (400), `unauthorized` (401), `upgrade_required` /
`session_limit_reached` / `client_limit_reached` / `session_too_long` (402),
`forbidden` / `consent_required` (403), `not_found` (404),
`conflict` / `invalid_transition` / `not_processable` (409),
`internal_error` (500).

> Full OpenAPI generation and the remaining endpoints (upload init/chunk/complete,
> billing, integrations, client-portal, admin) are scheduled for the following
> milestones; the routes above are implemented and covered by tests.
