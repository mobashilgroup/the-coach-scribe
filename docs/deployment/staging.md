# Staging

Staging mirrors production but uses test/sandbox credentials. It is where live
providers are exercised before production.

```bash
cp .env.example .env      # APP_ENV=staging, staging DB/Redis/storage
# Use real-but-sandbox keys: OpenAI/Deepgram test keys, SendGrid sandbox,
# Google OAuth test client, staging S3 bucket.
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api pnpm exec tsx prisma/seed.ts
```

## Sign-off before promoting to production
- `pnpm --filter @tcs/api test` green.
- Browser smokes pass at staging:
  `BASE=<staging>/app/index.html node apps/web_portal/verification/verify-workflow.mjs`
  and `ORIGIN=<staging> node apps/web_portal/verification/verify-portal.mjs`.
- One real session processed end-to-end with live STT + analysis.
- Retention worker deletes a due audio file (check the `retention.audio_deleted`
  audit entry).
