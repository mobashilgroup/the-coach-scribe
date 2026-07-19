# Decisions pending owner input (Spec §34)

None of these block development — all are wired as configuration (env, plan
records, or feature flags). They are listed here because they need a commercial
decision or real credentials from the product owner (Mobashil Group S.A.).

## Need a commercial decision (configurable, safe defaults shipped)

1. **Final prices** for Starter, Pro, Elite, Enterprise. → seeded plan rows, editable.
2. **Free tier shape**: 3 total trial sessions vs 2 per month. → `plans.limits_json`.
3. **Exact minute limits** per session / per month. → `MAX_SESSION_MINUTES`, plan limits.
4. **Transcript retention default**: 30 vs 90 days. → `DEFAULT_RETENTION_DAYS` (shipped: 90).
5. **Audio delete delay** after processing. → `AUDIO_DELETE_AFTER_HOURS` (shipped: 24).
6. **Email provider** choice. → `EMAIL_PROVIDER_API_KEY` + adapter.
7. **Exact OpenAI / Deepgram models**. → `OPENAI_MODEL`, `DEEPGRAM_MODEL`.
8. **PayPal** at launch or later (Stripe is priority). → feature flag.
9. **Languages enabled day one**. → i18n config / feature flag.
10. **White-label** exact feature set. → `plans.features_json`.
11. **WhatsApp** send policy. → feature flag + template config.
12. **App Store / Play** subscription rules review before store submission.

## Need real credentials / accounts (owner must create)

- Google OAuth client (id + secret) and Calendar/Drive scopes.
- Apple Sign-In (team id, key id, private key).
- Deepgram API key.
- OpenAI API key.
- Stripe secret + webhook signing secret.
- S3-compatible bucket + access keys.
- Transactional email provider key.
- FCM/APNs push credentials.
- Sentry DSN.

Until provided, `TRANSCRIPTION_PROVIDER=fake` and `ANALYSIS_PROVIDER=fake` run
the entire flow deterministically for development and tests.

> Note: the legacy `config.js` (see `legacy/pwa-prototype/`) committed a Google
> client id and a PayPal client id to the frontend. Treat those as compromised
> and rotate them.
