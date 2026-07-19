# Architecture overview

The Coach Scribe is a multi-surface SaaS. This repository is the production
monorepo. Milestone 1 delivers the **backend API core**; other surfaces are
scaffolded and documented for subsequent milestones.

## Surfaces

| Surface | Path | Status |
|---|---|---|
| Coach & portal API | `services/api` | **Milestone 1 (this)** |
| AI worker (STT + analysis) | `services/ai_worker` | interfaces live in API; dedicated worker = Fase 1 follow-up |
| Notification worker | `services/notification_worker` | Fase 2 |
| Coach web app | `apps/web_portal` | Milestone 2 |
| Public website | `apps/public_website` | Milestone 2 |
| Admin console | `apps/admin_console` | Milestone 2 |
| Flutter mobile | `apps/mobile_flutter` | Milestone 3 |

## Backend stack (Milestone 1)

- **Node 20+ / TypeScript**, ESM.
- **Fastify** HTTP framework.
- **Prisma** ORM over **PostgreSQL 16**.
- **Zod** for env + request + AI-output validation.
- **Vitest** for unit tests.
- Redis + BullMQ and S3-compatible object storage are provisioned in
  `docker-compose.yml` and referenced by env; queue/worker wiring is the next
  slice.

## Layering (dependency direction points inward)

```
 HTTP routes (Fastify)  ->  module services  ->  domain (pure)  ->  Prisma
                                     |
                            provider interfaces (STT / analysis)
                                     |
                        fake | deepgram | openai adapters
```

- **`src/domain/`** is pure and framework-free: plans engine, session state
  machine, usage ledger, AI schema, consent, retention. 100% unit-tested,
  no database or network. This is where the business rules the spec is strict
  about (limits, states, consent gating, "AI proposes, coach decides") live.
- **`src/modules/`** are the HTTP-facing feature slices; each owns its routes
  and a service that talks to Prisma and to the domain layer.
- **Providers** (Deepgram STT, OpenAI analysis) sit behind interfaces so they
  can be swapped without touching callers (Spec §14.6, §19.4). A deterministic
  `fake` provider lets the whole pipeline — and its tests — run with no keys.

## Non-negotiables enforced in code

- **Tenant isolation** (Spec §16.2): every data access is scoped by
  `organizationId` + coach permission. A `client_id` from the browser is never
  trusted without an ownership check.
- **Secrets never reach the frontend** (Spec §19.5). Config is validated at
  boot in `src/config/env.ts`; the API is the only tier holding provider keys.
- **No auto-share** (Spec §8, §14.5): AI output is created in
  `review_required`; sharing requires an explicit human approval transition.
- **Session consumed on processing, not on Record** (Spec §13.5).

See `data-model.md`, `api.md`, `security.md`, `ai-pipeline.md` for detail.
