# Runbook — SATUSEHAT resource-list backfill (P21-T05)

## What this fills in

P21-T02 records what each submission sent: one row per resource with the id
SATUSEHAT assigned, plus one per item left out. Only submissions processed
**after** it shipped have that list. Every encounter reported before it carries
only its Encounter id, so the monitor's detail drawer (P21-T03) and the doctor's
check (P21-T04) show nothing for those visits.

The platform still holds what was sent, and most of it is searchable by visit,
so the list can be reconstructed.

## What it cannot recover, and why that is flagged

**What a submission left out is gone.** A skip existed only in the running
worker's memory and the server log; nothing on the platform records the
medication that was never sent. So every row this writes is marked
`is_backfilled = true`, and the UI reads that to say skipped items are _unknown_
for the submission rather than implying there were none.

Two more gaps, both deliberate:

- **MedicationDispense is not backfilled.** Its `?encounter=` parameter is
  accepted, silently ignored, and returns an unrelated row — P21-T01 passed two
  different nonexistent encounter ids and got the same dispense back, whose real
  context was a third encounter. Following the docs here would have stamped
  another visit's dispense onto every row. The working form needs `context=`
  **and** `subject=`, where subject is the patient's IHS number — stored
  encrypted, and not worth decrypting per row for a provenance link.
- **Immunizations are not backfilled**, for the same reason: `Immunization`
  searches by patient only. `Medication` is skipped because it is reachable only
  through each MedicationRequest's `medicationReference`, a second request per
  prescription line for a link nothing reads.

Allergy ids _are_ filled in, copied from the local column rather than searched,
since we already hold them.

**Condition and Observation rows get a null `local_record_id`.** The platform
stamps no org-scoped identifier on those two types (P21-T01), so a backfilled
row knows the SATUSEHAT id but not which local diagnosis or vital sign it came
from. Procedure, MedicationRequest, ClinicalImpression and Composition do carry
one and are matched back.

## When to run it

- Once per environment that submitted encounters before P21-T02 shipped.
- Again only if the monitor shows submissions whose detail says the list is
  missing.
- **Never after a SATUSEHAT environment switch.** The backfill searches whichever
  platform the deployment is now pointed at, so running it after moving to
  production would find nothing for sandbox-era visits and report every row as
  nothing-found. See `satusehat-production-switch-runbook.md`.

There is no deadline. Nothing downstream reads the list except the monitor and
the doctor's check; it is provenance, not a queue.

## Prerequisites

- `SATUSEHAT_ORGANIZATION_ID`, credentials and `DATABASE_URL` set for **the same
  environment** — the script refuses to run unless `--org-id` matches the
  configured organization id, because the identifier match is org-scoped and a
  mismatch would silently recover no local ids and look like a clean run.
- The submission worker may keep running. The script never touches PENDING or
  FAILED rows, and it only inserts rows for submissions that have none.

## Running it

Always dry-run first:

```bash
pnpm --filter @hms/api backfill:satusehat-resources -- --org-id=<org-id> --dry-run
```

It reports how many submissions it would list and how many resources it found,
without writing. Then:

```bash
pnpm --filter @hms/api backfill:satusehat-resources -- --org-id=<org-id>
```

**Idempotent.** A submission that already has a list is not selected, so a
second run reports nothing to backfill. Safe to re-run after an interruption:
it continues with the rows still unlisted.

Requests are **sequential and spaced by 250 ms**, and there are six searches per
submission. That is slow on purpose — the circuit breaker inside
`SatusehatHttpClient` is shared with the submission worker, so a parallel burst
here would open it for live traffic. Budget roughly two seconds per submission.
If the breaker does open mid-run the script stops, reports how far it got, and
exits non-zero; re-run it later.

## Reading the output

```
Summary: 12 submission(s) listed (86 resource(s)), 1 with nothing found on the platform.
```

- **listed** — the list was written (or would be, on a dry run).
- **nothing found** — the row says SUBMITTED but the platform holds no resources
  for that visit. Worth checking one by hand before assuming it is a search
  problem: it can also mean the bundle was rejected after the row settled, which
  is a real finding rather than a backfill failure.

## Rolling back

The list is derived data with no dependents, so removing it is safe:

```sql
DELETE FROM satusehat_submission_resources WHERE is_backfilled = true;
```

That leaves lists recorded at submission time untouched, since those are the
authoritative ones.

## Related

- `satusehat-read-back-spike.md` — which searches actually work, and the
  MedicationDispense trap above.
- `satusehat-encounter-id-backfill-runbook.md` — the earlier backfill, which
  fills the Encounter id this one depends on. Run that first if the monitor
  shows SUBMITTED rows with an empty IHS column.
- `satusehat-production-switch-runbook.md` — why this must not be run across an
  environment change.
