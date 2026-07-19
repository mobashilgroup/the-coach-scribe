# Local development

## Prerequisites
- Node 20+ and pnpm 10+
- PostgreSQL 16 (via `docker compose up -d postgres`, or a local cluster)

## Steps
```bash
# 1. Install
pnpm install

# 2. Bring up Postgres + Redis
docker compose up -d           # or run your own Postgres and set DATABASE_URL

# 3. Configure
cp .env.example services/api/.env   # then edit; at minimum set DATABASE_URL + JWT_SECRET

# 4. Database
cd services/api
pnpm prisma:generate
pnpm prisma:migrate            # applies migrations
pnpm exec tsx prisma/seed.ts   # seed launch plans (Free Trial / Starter / Pro)

# 5. Run
pnpm dev                       # API on :4000 (see PORT)
```

## Verify
```bash
curl localhost:4000/health
# {"status":"ok","env":"development"}
```

## Tests
```bash
cd services/api
pnpm test                      # unit tests only (no infra needed)

# Full end-to-end suite against a live database:
DATABASE_URL="postgresql://tcs:tcs@127.0.0.1:5432/tcs?schema=public" \
TCS_DB_TESTS=1 JWT_SECRET="dev-secret-at-least-32-characters-long!" \
pnpm test
```

## Providers
With `TRANSCRIPTION_PROVIDER=fake` and `ANALYSIS_PROVIDER=fake` (the defaults)
the entire record→summary flow runs deterministically with no external keys.
Set them to `deepgram` / `openai` and provide the keys to use the real services.
