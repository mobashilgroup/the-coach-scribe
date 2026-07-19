# @tcs/api

The Coach Scribe API (Milestone 1). Node + TypeScript + Fastify + Prisma/PostgreSQL.

- `src/domain/` — pure business rules (plans, session state machine, usage, AI
  schema+repair, consent, retention, provider interfaces). No DB, no network,
  fully unit-tested.
- `src/modules/` — HTTP feature slices (auth, clients, sessions, summaries, tasks).
- `src/lib/`, `src/plugins/`, `src/config/` — errors, auth, JWT, tenant isolation, env.
- `prisma/` — schema, migrations, seed.

## Scripts
| Script | Purpose |
|---|---|
| `pnpm dev` | Run with watch (`tsx`). |
| `pnpm start` | Run the server. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Vitest. Set `TCS_DB_TESTS=1` + `DATABASE_URL` for the live-DB E2E. |
| `pnpm prisma:migrate` | Apply migrations (dev). |
| `pnpm prisma:deploy` | Apply migrations (prod). |

See [`../../docs/deployment/local.md`](../../docs/deployment/local.md) and
[`../../docs/architecture/api.md`](../../docs/architecture/api.md).
