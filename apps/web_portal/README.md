# Coach web console (`apps/web_portal`)

A functional coach web app in the black/white/gold brand (Spec §6). **No build
step** — plain HTML/CSS/ES modules. Every button calls the real API on the same
origin; no secrets live in the browser, only the coach's own access token
(Spec §19.5).

It drives the full mandatory flow (Spec §8): register/login → dashboard →
clients → new session (free text **or** audio upload) → recording consent →
process (transcribe + diarize + AI summary) → review & edit → approve → share →
history → export (JSON / printable HTML).

## Run it
The API serves this folder at `/app/` when `WEB_DIST_DIR` points here:

```bash
cd services/api
WEB_DIST_DIR="$(pwd)/../../apps/web_portal" \
DATABASE_URL=... JWT_SECRET=... pnpm dev
# open http://localhost:4000/app/index.html
```

## Verified in a real browser
`verification/` holds screenshots captured by a Playwright run that walks the
entire workflow and asserts each stage (register → … → export, plus the
audio-upload path with consent gating and diarization). The driver script is
`verification/verify-workflow.mjs`.

> This is the Milestone-2 coach console. It is intentionally lean (the full
> screen map — settings, integrations, billing, appointments — lands in later
> milestones) but contains **no fake buttons**: everything shown works against
> the API.
