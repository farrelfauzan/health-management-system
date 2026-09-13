# Testing SATUSEHAT locally (P21-T10)

## One command

With sandbox credentials in `apps/api/.env` and a migrated, seeded database:

```bash
pnpm --filter @hms/api seed:satusehat-sandbox
# more doctors sharing the primary's practitioner id:
pnpm --filter @hms/api seed:satusehat-sandbox -- --extra-doctors=4
```

It creates — or finds from a previous run — linked test doctors and patients,
ready to close an encounter and submit it. It is idempotent: a second run
reports every record as existing and already linked.

```
  Primary doctor: created, linked
  Extra doctor 1: created, linked
  Extra doctor 2: created, linked
  Patient 1: created, linked
  ...
SATUSEHAT sandbox seed complete: every identity is linked.
```

## What it refuses to do

The command stops before touching the database unless all three hold:

- `SATUSEHAT_FHIR_BASE_URL` resolves to the **sandbox**. This is the same
  derivation the integrations screen shows (P21-T06). An unrecognised host is
  refused as well, because it may be a proxy in front of production.
- `NODE_ENV` is not `production`. This check is separate from the host check.
  The database and the SATUSEHAT host are configured independently, and a
  production database is still a production database even when it points at
  the sandbox.
- SATUSEHAT credentials are configured. Every record is linked by a live lookup,
  so without credentials the command would create unlinked rows and report
  success.

## What it creates, and the shortcuts involved

| Record                                    | How it is linked                                |
| ----------------------------------------- | ----------------------------------------------- |
| Primary doctor, NIK `3313096403900009`    | By NIK lookup                                   |
| Extra doctors (`SANDBOX-DOCTOR-1`, …)     | **Share the primary's practitioner id**, no NIK |
| Five patients (`SANDBOX-PATIENT-1` … `5`) | By NIK lookup                                   |

- **The extra doctors are a sandbox-only shortcut.** `doctor_profiles.nik_index`
  is unique, so only one local doctor can hold a NIK, and only one published
  practitioner NIK resolves cleanly. The extras therefore hold the IHS number
  directly. In production each doctor is a different person with a different
  national record, so never copy this pattern.
- **No invitation is sent and no account is created.** Records are written
  directly rather than through `POST /doctors`, which (since P20-T01) requires
  an email and sends an invitation. The doctors show as `NO_ACCOUNT` in the
  directory. That does not affect SATUSEHAT submission. To sign in as one,
  invite it from the doctor page.
- **Seeded patients carry no privacy-notice evidence**, for the same reason:
  the create route that captures it is bypassed.
- An existing doctor that already holds the primary NIK is reused, not
  duplicated. For example, a doctor filled in by the older
  `seed:sandbox-practitioner-nik` command keeps its name and licence.

## Why only these NIKs

The published test tables do not match the live sandbox, so every identity in
the fixtures was **probed live** and kept only if it resolved to exactly one
record. An ambiguous answer means `entry[0]` belongs to somebody else.

**Practitioners** (probed 2026-08-29,
`apps/api/src/modules/satusehat/fixtures/satusehat-sandbox-practitioners.ts`):
of the ten published NIKs, five do not exist and four match 2, 2, 26 and 27
duplicate registrations made by other vendors. Only `3313096403900009` matches
one record, which is why the seed builds every doctor on it.

**Patients** (probed 2026-09-12,
`apps/api/src/modules/satusehat/fixtures/satusehat-sandbox-patients.ts`):

| NIK                                                        | Result                   |
| ---------------------------------------------------------- | ------------------------ |
| `9271060312000002`, `9271060312000003`                     | one record each: kept    |
| `0000000000000000`, `1111111111111111`, `9999999999999999` | one record each: kept    |
| `9271060312000001`                                         | **two** records: omitted |
| `3524016901830001`, `3175031305200001`                     | none: omitted            |

No IHS numbers are stored in either fixture. They are resolved from the NIK at
link time, because published IHS values were wrong for nine of ten
practitioners.

## If the seed reports an identity it could not link

The sandbox is shared by every vendor and drifts. A NIK that resolved to one
record when probed can gain a duplicate later. Re-probe before changing
anything:

```
GET {SATUSEHAT_FHIR_BASE_URL}/Patient?identifier=https://fhir.kemkes.go.id/id/nik|<nik>
GET {SATUSEHAT_FHIR_BASE_URL}/Practitioner?identifier=https://fhir.kemkes.go.id/id/nik|<nik>
```

Keep only the NIKs that answer `total: 1`, and update the fixture and its spec
together. The spec pins the probed list on purpose, so copying a NIK back from
the published table means removing a test first.

## The sandbox cannot be wiped

The FHIR API documents no `DELETE`, and other tenants write into the sandbox.
A "clean" test means a fresh **local** database plus this seed. It never means
a clean platform. Encounters submitted against these patients accumulate on the
sandbox for good. That is harmless there, and it is the reason the seed must
never run against production.

## Related

- `satusehat-production-switch-runbook.md`: moving off the sandbox, and why the
  ids this seed writes must be cleared when you do.
- `satusehat-read-back-spike.md`: what the live platform actually returns.
