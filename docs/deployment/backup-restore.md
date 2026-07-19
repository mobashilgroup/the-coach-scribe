# Backup & restore (Spec §24.7)

## What to back up
1. **PostgreSQL** — the system of record (all coach/client/session data).
2. **Object storage** — media and exports. Note: audio is short-lived by design
   (deleted after processing), so most storage backups are transcover exports.
3. **Secrets** — kept in the platform's secret manager, backed up separately
   from data.

## PostgreSQL

Nightly base backup + WAL/PITR on the managed instance (preferred), or logical
dumps:

```bash
# Backup
pg_dump "$DATABASE_URL" -Fc -f tcs-$(date +%F).dump      # (timestamp via shell)

# Restore into an empty database
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" tcs-YYYY-MM-DD.dump
```

- Encrypt dumps at rest; store off-host with a defined retention.
- **Test restores** on a scratch database on a schedule — a backup you have not
  restored is not a backup.

## Object storage
Enable bucket versioning + lifecycle rules. Replicate to a second region if
required. Deletions driven by retention are audited (`retention.*`) so they can
be reconciled against backups.

## Restore drill (quarterly)
1. Provision a scratch DB; `pg_restore` the latest dump.
2. Point a staging API at it; run `/health` and a read-only smoke.
3. Verify row counts for `users`, `sessions`, `summaries` vs monitoring.
4. Record the drill result and restore time (RTO).

## Retention & legal holds
Retention deletions (audio, transcripts) and user erasure requests must be
consistent with backups: a legal hold suspends deletion; an erasure request must
propagate to backups per the defined retention window.
