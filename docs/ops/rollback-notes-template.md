# Rollback Notes Template

Copy this block into the PR description of every migration PR (see the [migration review checklist](migration-review-checklist.md)). Prisma Migrate has no down migrations — "rollback" here always means a **new forward migration** that reverses the change, or a restore from backup for data loss scenarios.

```markdown
## Migration impact

- **Migration folder:** `apps/api/prisma/migrations/<timestamp>_<name>`
- **Tables touched:** <table list>
- **Change type:** additive | destructive | data backfill | index/constraint only
- **Backward compatible with previous release:** yes / no — <why>
- **Estimated apply time / locks:** <e.g. instant, seconds on ~10k rows, table lock on X>
- **Seed impact:** none / requires re-running `pnpm db:seed` because <reason>

## Rollback plan

- **Reversal strategy:** forward migration that <exact reversal, e.g. re-adds column X nullable> / restore from backup (data loss window: <window>)
- **Reversal SQL sketch:**
  ```sql
  -- statements a reverting migration would contain
  ```
- **Data at risk:** none / <what is lost if we roll back after writes have occurred>
- **Code rollback dependency:** can the previous API release run against the new schema? yes / no — if no, the API must be rolled back together with the DB restore.
- **Verification after rollback:** <query or health check proving the system is consistent>

## Decision log

- **Why now:** <one line>
- **Alternatives considered:** <one line, or "none">
```

## Guidance

- **Additive changes** (new nullable column, new table, new index): reversal SQL is usually a single `DROP`; state it anyway so the on-call engineer doesn't have to derive it at 3 AM.
- **Destructive changes**: the two-step pattern from the checklist means the rollback of step N is "do nothing" (the column/table still exists). Say so explicitly.
- **Backfills**: record the source of truth for the backfilled values; a rollback that restores from backup must know whether backfilled data can be regenerated.
- Keep the filled-in notes in the PR — they are the audit trail the deployment runbook points to when a release needs to be reverted.
