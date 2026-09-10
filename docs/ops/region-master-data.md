# Region master data (province, regency, district, village)

`P19-T10` (SJ-167). The four tables `provinces`, `regencies`, `districts` and
`villages` hold the Indonesian administrative hierarchy keyed by the
Kemendagri *kode wilayah* (`11`, `11.01`, `11.01.01`, `11.01.01.2001`). A
patient's structured address points at one row per level, the read path
resolves the names through the relations, and the SATUSEHAT Patient mapper
spells the same codes without their dots in the `administrativeCode`
extension. Nothing in the clinic UI edits these tables.

## Source and licence

| | |
| --- | --- |
| Dataset | [cahyadsn/wilayah](https://github.com/cahyadsn/wilayah), file `db/wilayah.sql` |
| Licence | MIT, copyright (c) Cahya DSN. The codes and names themselves are Kemendagri administrative data (Kepmendagri No. 300.2.2-2138 Tahun 2025 and its later updates, as the upstream repository tracks them) |
| Commit shipped | recorded in the header of `apps/api/prisma/wilayah.sql` (`-- Commit:`), together with the row count per level |
| Rows | 38 provinces, 514 regencies and cities, 7,285 districts, 83,762 villages at the shipped commit |

The upstream dump is not committed; only its transformation is. The seed file
is generated and must never be edited by hand.

## How it is loaded

`pnpm db:seed` runs `prisma db seed` (roles and permissions), then
`lab-catalog.sql`, then `wilayah.sql`. The region file is one transaction of
multi-row `INSERT ... ON CONFLICT ("code") DO UPDATE` statements, at most
5,000 rows each, inserted parents first so the foreign keys hold mid-load.
The upsert only touches a row whose name or parent changed, so re-running
the seed on an existing environment is a no-op (`updated_at` stays put).

Timing measured with `prisma db execute` on a developer Mac against the
Docker Postgres: about 8 seconds for the full 91,599 rows on an empty
database, and about 4.5 seconds for a re-run that changes nothing (both
figures include roughly 1.5 seconds of Prisma CLI startup).

`prisma migrate deploy` never seeds. A fresh environment, and any environment
being upgraded to the release that introduced `P19-T10`, needs `pnpm db:seed`
once after the migration. Without it the four region endpoints answer empty
lists and any patient write carrying an address chain is rejected as unknown
codes, while a write with no chain keeps working.

## Refreshing the dataset

Kemendagri publishes changes a few times a year (new regencies, renamed
villages). To pick them up:

1. Download the current dump and note the commit it came from:

   ```bash
   curl -fsSL -o /tmp/wilayah.sql https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql
   curl -fsSL "https://api.github.com/repos/cahyadsn/wilayah/commits?path=db/wilayah.sql&per_page=1" | grep -m1 '"sha"'
   ```

2. Regenerate the seed from the repo root, passing that commit:

   ```bash
   pnpm --filter @hms/api wilayah:build -- /tmp/wilayah.sql --commit <sha>
   ```

   The transform (`apps/api/src/scripts/build-wilayah-seed.ts`) refuses a
   dump with duplicated codes, an orphaned child or an unnamed row, so a
   broken upstream file fails here rather than half-way through a load.

3. Run the unit spec `wilayah-seed.spec.ts` and the integration spec
   `regions-seed.integration.spec.ts` (both under
   `apps/api/src/modules/regions/`), commit the new `wilayah.sql`, and note
   the seed re-run in the PR's migration section.

4. On each environment, run `pnpm db:seed` after deploying.

## Retired regions

The seed never deletes. A code the dataset no longer carries stays in the
table so that every address naming it keeps resolving; mark it
`is_active = false` by hand if it should stop being offered in the form.
Every foreign key onto these tables is `ON DELETE RESTRICT` for the same
reason: a region with patients in it cannot be removed, only deactivated.

## How a patient address uses it

The four region codes are **optional** on every patient write. They are
validated as a chain against the master data whenever they are present, and
refused when only some of them are, but a create with no chain at all is
accepted: the front-desk form has no region picker until `P19-T11` adds one.
Tighten `createPatientSchema` to require them once that form ships.

## Reading the API

`GET /api/v1/regions/provinces`, `/regencies?provinceCode=`,
`/districts?regencyCode=` and `/villages?districtCode=&q=&page=&limit=`
(villages are paged and searchable by name prefix). All four require an
authenticated caller holding `patient.read` in either scope, and answer with
`Cache-Control: public, max-age=86400`.
