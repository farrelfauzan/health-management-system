# Terminology master data (ICD-10, ICD-9-CM)

`icd10_codes` holds the diagnosis catalog a `Diagnosis` is coded from, and
`icd9cm_codes` the procedure catalog behind a `Procedure`. Both are reference
data: nothing in the clinic UI edits them, a SATUSEHAT `Condition` carries the
ICD-10 code and a `Procedure` the ICD-9-CM code, and BPJS prices a claim from
the procedure codes recorded against a visit.

## Source and licence

| | |
| --- | --- |
| ICD-10 | [SATUSEHAT ICD-10 terminology](https://satusehat.kemkes.go.id/platform/docs/id/terminology/icd/icd-10/) — the spreadsheet that page links to, version `ICD10_2010` |
| ICD-9-CM | [SATUSEHAT ICD-9-CM terminology](https://satusehat.kemkes.go.id/platform/docs/id/terminology/icd/icd-9-cm/) — version `ICD9CM_2010` |
| Rows shipped | 18,542 ICD-10 codes (2,048 three-character categories and 16,494 subdivisions), 4,626 ICD-9-CM procedure codes |
| Upstream | ICD-10 is a WHO classification; ICD-9-CM is the US clinical modification. Kemenkes republishes both as the versions SATUSEHAT validates against, and those republished lists — not the WHO or CMS originals — are what this repo ships |

SATUSEHAT requires the **2010** edition of both. The [WHO ICD-10 2010
browser](https://icd.who.int/browse10/2010/en) is useful for reading a code's
context, but it is not the list to import: the gateway validates against the
Kemenkes publication.

The export is not committed; only its transformation is, the same rule the
region seed follows. `prisma/icd10.sql` and `prisma/icd9cm.sql` are generated
and must never be edited by hand.

## How it is loaded

`pnpm db:seed` runs `prisma db seed` (`seed.sql`), then `lab-catalog.sql`,
`wilayah.sql`, `icd10.sql` and `icd9cm.sql`. Each terminology file is one
transaction of multi-row `INSERT ... ON CONFLICT ("code") DO UPDATE`
statements, at most 2,000 rows each.

Two properties matter:

- **Indonesian titles survive.** The official exports carry English titles
  only. `seed.sql` curates a working Indonesian title for the codes a clinic
  sees most, and the generated files never write `display_indonesian` — not on
  insert, not on update — so those translations are not flattened by a reload
  or by a refreshed export. Clinicians search in Indonesian, so losing them
  would be a real regression.
- **Re-running is a no-op.** The upsert only touches a row whose title,
  category, chapter or active flag changed, so `updated_at` stays put.

Measured with `prisma db execute` against Docker Postgres on a developer Mac:
about 2 seconds to load both files on an empty catalog, and about 2 seconds for
a re-run that changes nothing (both including Prisma CLI startup).

`prisma migrate deploy` never seeds. A fresh environment, and any environment
upgraded to the release that introduced these files, needs `pnpm db:seed` once
after the migration. Without it the catalogs hold only the starter rows from
`seed.sql`, so most real diagnoses and procedures cannot be coded.

## `category` and `chapter`

`category` is the parent code in both catalogs — the three characters before
the dot for ICD-10 (`J06` for `J06.9`), the two digits for ICD-9-CM (`93` for
`93.94`). `chapter` is ICD-10 only, the Roman numeral derived from the category
by `deriveIcd10Chapter` in `@hms/shared-types`, which the generator, the
importer and the `seed.sql` `CASE` all share. 17 shipped codes (the `U` block —
SARS and the antimicrobial-resistance codes) fall outside the 21 chapter ranges
and carry a `NULL` chapter, which is what that function returns for them.

ICD-9-CM has no chapter column: its procedure chapters do not map to a clean
lexicographic range the way ICD-10 chapters do.

## Refreshing the lists

Kemenkes republishes when SATUSEHAT moves to a new edition.

1. Download the spreadsheet each terminology page links to and save it as CSV
   with a `CODE` and a `DISPLAY` column (the published files are `.xlsx`; any
   spreadsheet tool exports the sheet as CSV). The `VERSION` column is ignored.

2. Regenerate from the repo root:

   ```bash
   pnpm --filter @hms/api terminology:build -- icd10 /tmp/icd10.csv
   pnpm --filter @hms/api terminology:build -- icd9cm /tmp/icd9cm.csv
   ```

   The transform (`apps/api/src/scripts/build-terminology-seed.ts`) refuses an
   export with a duplicated code, a missing code or a missing title, so a broken
   file fails there rather than half-way through a load.

3. Commit the regenerated `prisma/icd10.sql` and `prisma/icd9cm.sql`, and note
   the seed re-run in the PR's migration section.

4. On each environment, run `pnpm db:seed` after deploying.

## Retired codes

Neither the seed nor the importer deletes. A code a newer edition drops stays
in the table so that every signed diagnosis and procedure naming it keeps
resolving; the foreign keys are `ON DELETE SET NULL` and the recorded code and
title are snapshotted onto the record itself for the same reason.

The difference between the two loaders is deactivation:

- **The seed files** (`icd10.sql`, `icd9cm.sql`) are purely additive. They
  upsert what the export contains and leave everything else alone, because a
  seed runs on every environment and must not reinterpret a catalog a clinic
  curated.
- **The importer** (`pnpm --filter @hms/api icd10:import <file.csv>`,
  `icd9cm:import`) owns a live catalog: it upserts the file and deactivates
  (`is_active = false`, never deletes) every code absent from it, in one
  transaction. Use it when an environment must match an edition exactly.
