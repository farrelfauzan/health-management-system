# Draft Patient Drain Runbook (P17-T05)

How `patient_profiles.date_of_birth`, `sex` and `address` became `NOT NULL`.

> **Rescoped 2026-08-31.** This started as a three-release plan — add, drain,
> tighten — on the assumption that a production database held legacy
> `CHANNEL_BOOKING` profiles to clear first. There was no production, and any
> future production starts on the post-`P17-T03` flow, where a chat booking
> writes a `ProspectivePatient` and never a half-empty `PatientProfile`. The
> drain had nothing to drain and was dropped. The dry-run report below is kept
> because it is still the thing that tells you whether the tightening will
> apply.

## Why the columns were nullable

`PCS-T07` let a chat booking create a `PatientProfile` directly. Strategy §5.3
forbids asking for a date of birth over an unauthenticated channel, and a
placeholder date written into a record PMK 24/2022 keeps for twenty-five years
is worse than a null — so the three columns were made nullable and an MRN was
spent on everyone who typed "mau booking".

`P17-T01` and `P17-T03` removed that flow. A chat booking now opens a
`ProspectivePatient`: a name and a phone number, no MRN, no clinical field.
`P17-T04` allocates the MRN at the counter, against demographics a human has
read off an ID document.

Every path that creates a patient today supplies all three columns:

| Path | Source of the three columns |
| --- | --- |
| `POST /patients` (front desk) | `createPatientSchema` — all three required |
| `POST /prospective-patients/:id/convert` | the same schema |
| BPJS Antrean inbound registration | `tanggallahir` / `jeniskelamin` / `alamat` |
| `seed.sql` | inserted explicitly |

---

## Before deploying: the dry run

Read-only, mutates nothing. Run it with a **read-only database account**.

```bash
pnpm db:report:draft-patients
```

Against a specific database, writing the CSV somewhere deliberate:

```bash
DATABASE_URL="$READ_ONLY_URL" pnpm db:report:draft-patients --csv=/secure/path/draft-patients.csv
```

The number that matters is **`Rows that would abort the NOT NULL tightening`**.
It counts every row with a null in any of the three columns — **any source,
soft-deleted included**, because `NOT NULL` is table-wide and a retired record
fails the `ALTER` exactly as loudly as a live one.

Zero means the migration will apply. Anything else means it will abort, and the
CSV lists the MRNs somebody has to complete through the patient-edit screen
first.

The report also still splits `CHANNEL_BOOKING` profiles by clinical activity.
That split no longer drives a migration; it is now just a description of any
legacy rows a database happens to hold.

---

## The migration

`prisma/migrations/20260912000000_require_patient_core_demographics`

A guard, then three `ALTER … SET NOT NULL`.

**The guard has no repair half, and that is the point.** A `DEFAULT`, or an
`UPDATE` filling in a placeholder birth date, is how a made-up date of birth
enters a medical record and stays there for twenty-five years. The guard is
allowed to read and to raise, and nothing else — a failed deploy is the correct
outcome. It exists rather than leaving Postgres to fail on its own because
Postgres names the *column* and not the *row*, which leaves an operator
searching a patient table mid-deploy.

Deploy the usual way; migrations run before the new API image serves traffic:

```bash
pnpm db:migrate:deploy
```

If it aborts, the exception names the offending ids. Complete those records
through the patient-edit screen, re-run the dry run until it reports zero, and
deploy again. Nothing has changed in the meantime — the guard raises inside the
migration's own transaction.

### Rollback

Prisma Migrate is forward-only. This one reverses cleanly with a new forward
migration dropping the three constraints; it writes no data, so there is
nothing to restore.

### Restore drill

Worth doing once against a restored dump before the first production deploy:

1. Restore the dump into a scratch database.
2. Run the dry run; confirm it reports zero blocking rows.
3. `prisma migrate deploy`; confirm it completes.
4. On a second fresh restore, plant a row with a null `address` and confirm the
   migration aborts naming it and leaves the schema unchanged.

Step 4 is covered by
`apps/api/src/modules/patient-management/require-core-demographics-migration.integration.spec.ts`,
which reads the guard out of the migration file so the test and the deployed
SQL cannot drift.

---

## Left behind

The `PCS-T08` draft surface — `mergeDraftPatient`, the `patientIsDraft`
branches on the arrival worklist, `CHANNEL_DRAFT_MISSING_FIELDS`, and the merge
dialog on the web — now guards a record shape nothing can create. It is
unreachable rather than wrong, and removing it is its own change.

`PatientRecord` still types the three columns as nullable for the same reason.
Narrowing it belongs with that removal.
