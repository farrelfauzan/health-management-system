# Runbook — SATUSEHAT encounter id backfill (P10-T14)

## What this fixes

Commit `8b73614` corrected the transaction-response parser: the platform
answers with **absolute** `Location` URLs
(`https://…/fhir-r4/v1/Encounter/<id>/_history/<version>`), while the recorded
fixtures used the relative form, so the parser passed its tests and returned
`null` in production.

Rows submitted before that fix are `SUBMITTED` with
`satusehat_encounter_id = NULL`. The bundle **was** sent, so the retry endpoint
refuses them with 409 — correctly — and the provenance link between the local
encounter and the national record is simply missing. In the integrations
monitor these look like green SUBMITTED rows with an empty IHS column.

The platform still holds those Encounters under their org-scoped identifier,
so they can be looked up and the column filled in.

## When to run it

- Once per environment that submitted encounters before `8b73614` landed.
- Again only if the monitor shows SUBMITTED rows with an empty IHS column.

There is no deadline: nothing downstream reads the column except the monitor
and support. It is provenance, not a queue.

## Prerequisites

- `SATUSEHAT_ORGANIZATION_ID`, credentials, and `DATABASE_URL` set for the
  environment being fixed — **the same environment**. See the guard below.
- The submission worker may keep running; the script never touches PENDING or
  FAILED rows.

## Running it

Always dry-run first:

```bash
pnpm --filter @hms/api backfill:satusehat-encounter-ids -- --org-id=<org-id> --dry-run
```

Then, if the counts look right:

```bash
pnpm --filter @hms/api backfill:satusehat-encounter-ids -- --org-id=<org-id>
```

`--org-id` is mandatory and must equal `SATUSEHAT_ORGANIZATION_ID`, or the
script refuses to start. The identifier search is organisation-scoped: running
it with one deployment's credentials against another's rows would find nothing
and report every row `NOT_FOUND` — a misleading answer rather than an error,
which is exactly the failure this guard exists to prevent.

## Expected output

```
Dry run: resolving 12 legacy submission(s)...
Would fill 10 · not found 1 · ambiguous 0 · encounter deleted 1
  NOT_FOUND submission=… encounter=…
  ENCOUNTER_GONE submission=… encounter=…
```

| Outcome | Meaning | What to do |
|---|---|---|
| `FILLED` | Exactly one Encounter on the platform | Nothing — the id is written |
| `NOT_FOUND` | The platform has no Encounter under that identifier | Usually submitted under a different org id in an earlier sandbox. Leave it; the row stays SUBMITTED with no id |
| `AMBIGUOUS` | More than one hit, or a hit with no usable id | The platform holds duplicates. A human decides which is authoritative; the script never picks |
| `ENCOUNTER_GONE` | The local encounter no longer exists | Skipped, and the platform is not touched |

## Re-run safety

Idempotent. Rows that already carry an id are not selected, so a second run
reports *"Nothing to backfill"*. A run interrupted part-way — including one
stopped by the circuit breaker opening — simply continues from the rows still
unfilled.

## If the circuit breaker opens mid-run

The script stops, prints how many rows it got through, and exits non-zero. The
breaker is shared with the submission worker, which is why requests are spaced
250 ms apart rather than sent in parallel. Wait for the breaker's open window
to elapse, then re-run; already-filled rows are skipped.

## What it never does

- Writes to the platform. Every upstream call is a `GET`.
- Touches PENDING or FAILED rows — those still have a working retry path.
- Guesses. Every non-`FILLED` row is listed with its local encounter id for a
  human to look at.
