# Draft Patient Drain Runbook (P17-T05)

How `patient_profiles.date_of_birth`, `sex` and `address` become `NOT NULL`.

This is deliberately **three releases**, not one migration. Existing rows have to
go somewhere before the constraint can exist, and the thing that decides where
each row goes is a judgement about a real person — so a human reads a report in
between.

| # | Release | What happens | State |
| --- | --- | --- | --- |
| 1 | **Add** | `P17-T01`…`P17-T04`. Chat bookings write `ProspectivePatient` rows; nothing existing changes. | Shipped |
| 2 | **Drain** | Existing `CHANNEL_BOOKING` drafts are resolved. | Not yet written — gates below |
| 3 | **Tighten** | The `NOT NULL` migration, and only once release 2 reports zero blockers. | Not yet written — gates below |

Prisma Migrate applies every pending migration in one `migrate deploy`. Releases
2 and 3 therefore have to reach `main` as **separate merges**; putting both
migration folders in one PR collapses them into one deploy and defeats the
entire point of the split.

---

## Step 1 — the dry run (read-only)

Run this first, every time, before anything else. It mutates nothing.

```bash
pnpm db:report:draft-patients
```

Against a specific database, and writing the CSV somewhere deliberate:

```bash
DATABASE_URL="$READ_ONLY_URL" pnpm db:report:draft-patients --csv=/secure/path/draft-patients.csv
```

Use a **read-only database account**. The script only issues `SELECT`s, and the
account should be the thing that guarantees it rather than the code review.

### Reading the output

**`CHANNEL_BOOKING profiles`** splits into two numbers, and the split is the
drain rule:

- **convert** — no encounter, registration, prescription or invoice names this
  record. Nobody ever attended on it, so release 2 turns it into a
  `ProspectivePatient` and retires the profile.
- **keep** — something clinical names it. That person attended. The record stays
  and the front desk completes it; a migration does not move encounters or
  invoices between patients to tidy a table.

**`Rows that would abort the NOT NULL tightening`** counts every row in the
table with a null in any of the three columns — **any source, soft-deleted
included**. `NOT NULL` is table-wide: a retired record fails the migration
exactly as loudly as a live one. This number, not the drain's, is the gate on
release 3.

### The two warnings, and what each one means

> `!! N of those carry immutable privacy-notice evidence.`

The drain rule says the `PatientProfile` "is removed". For these rows **that is
not an available operation.** `patient_privacy_notice_records` holds the
deferred privacy notice the channel captured at booking; its foreign key is
`ON DELETE RESTRICT`, and the table carries a `BEFORE UPDATE OR DELETE` trigger
that raises `privacy notice evidence is immutable`. The row can be neither
deleted nor repointed.

`PCS-T08` already reached this conclusion for the merge path and soft-deletes
the draft instead. Release 2 has to do the same: **soft-delete and deactivate
the profile, never `DELETE` it.** If this warning fires, amend the ticket's
wording before writing the migration.

> `!! N blocking row(s) the drain cannot fix.`

The drain only reaches `CHANNEL_BOOKING` records with no clinical activity.
Anything else blocking the tightening — an attended chat record, or a front-desk
record somebody left half-filled — needs a person to complete it through the
patient-edit screen. Hand the CSV to the front desk and re-run the dry run until
this is zero. **Release 3 is not schedulable while it is not.**

### The CSV

One line per record anybody has to deal with: MRN, source, disposition, whether
it blocks the tightening, which columns are missing, how many bookings ride on
it, and whether privacy evidence names it.

It carries **no demographics** on purpose. The file is a work list that will end
up in a shell history and an email; a dry run that exported dates of birth would
be a patient-data extract.

---

## Step 2 — the drain (release 2)

Gates before this migration is written:

- [ ] Dry run has been taken against production and its output attached to
      `P17-T05`.
- [ ] If the privacy-evidence warning fired, the drain retires profiles rather
      than deleting them.
- [ ] The migration is **idempotent and resumable** — re-running it after a
      partial failure is a no-op on rows it already handled.
- [ ] Each converted profile's appointments and `channel_patient_links` repoint
      to the new `ProspectivePatient` in the same transaction as the conversion.
      Appointments carry a `CHECK` allowing exactly one of `patient_id` /
      `prospective_patient_id` (`P17-T02`), so both columns are written.
- [ ] Reviewed against [migration-review-checklist.md](migration-review-checklist.md)
      with [rollback notes](rollback-notes-template.md) attached.

After deploying: re-run the dry run. Release 3 waits on it reporting **zero**
tighten blockers.

---

## Step 3 — the tightening (release 3)

Gates before this migration is written:

- [ ] The dry run reports zero blocking rows against production.
- [ ] The migration **refuses to run** if any row would violate the constraint —
      a pre-flight count that aborts and names the offending id. A failed deploy
      is better than a placeholder date written into a record kept for
      twenty-five years, and `NOT NULL` with a `DEFAULT` would do exactly that.
- [ ] `createPatientSchema` already requires all three columns, so no API change
      accompanies this; only the database is being aligned.
- [ ] Reviewed against the migration checklist with rollback notes.

The window between deploying release 2 and release 3 should be short but not
zero: the point of the gap is that somebody re-reads the report.

---

## Restore drill

Before running either migration against production, rehearse the whole sequence
on a restored dump:

1. Restore the latest production dump into a scratch database.
2. Run the dry run; record the counts.
3. Apply release 2; re-run the dry run and confirm the convert bucket is now
   zero and the counts moved as predicted.
4. Apply release 3; confirm it completes, then plant a violating row on a fresh
   restore and confirm it aborts cleanly and changes nothing.
5. Compare `patient_profiles` and `prospective_patients` counts before and
   after. The sum must be unchanged: the drain moves records between tables, it
   never loses one.

---

## Rollback

Prisma Migrate is forward-only; rollback is a new forward migration or a restore
from backup.

- **Release 2** is not reversible by a forward migration in any useful sense —
  the profiles it retired carry evidence rows that cannot be deleted, and the
  `ProspectivePatient` rows it created hold the only copy of some bookings'
  subject. Rollback is a restore. Take the dump immediately before deploying and
  confirm it is readable.
- **Release 3** reverses cleanly: a forward migration dropping the `NOT NULL`
  constraints. It writes no data.
