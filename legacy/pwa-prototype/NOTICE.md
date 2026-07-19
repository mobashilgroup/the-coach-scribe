# Legacy PWA prototype (LEGADO)

These files are the **previous** single-page PWA prototype for The Coach Scribe
(formerly CoRecap). They are preserved here **only as a visual and copy
reference**, per Master Spec §32 ("Inventario del prototipo anterior").

**Do NOT reuse this architecture.** The spec (§32.1) lists its known problems:

- `initApp is not defined` in a published build
- buttons with no real behaviour
- simulated authentication and transcription
- data kept only in `localStorage`
- no stable backend
- **sensitive configuration (Google / PayPal client IDs) committed in frontend `config.js`**
- 2023-dated demo legal text

The production system lives in `services/`, `apps/`, and `packages/` at the
repository root and follows the architecture in `docs/architecture/`.

The committed keys in `config.js` below should be treated as **compromised and
rotated** by the product owner if they were ever real.
