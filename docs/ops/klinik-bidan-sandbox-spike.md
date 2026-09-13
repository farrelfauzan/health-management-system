# Klinik Bidan: SATUSEHAT sandbox spike (P24-T01)

Probed on **13 September 2026** against the SATUSEHAT **staging sandbox**, with this repository's
own credentials (`SATUSEHAT_FHIR_BASE_URL` resolves to staging). It answers the open questions and
the UNVERIFIED rows the Klinik Bidan PRD (`docs/product/prd-satusehat-klinik-bidan.md` §12, §13.2)
leaves for this ticket. Each probe is marked **VERIFIED** or **STILL UNKNOWN**, with the request
and the response status.

No NIK of a real person and no key material appears in this file. The NIKs quoted are the published
sandbox test NIKs already committed in `satusehat-sandbox-patients.ts`, or a synthetic value marked
as such.

## Summary

| #   | Question                                                              | Answer                                                                                                                                                                                                                        | Status          | Unblocks / blocks                   |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------- |
| Q1  | Is a poli Location accepted **without** `serviceClass`?               | **Yes.** 201 Created                                                                                                                                                                                                          | VERIFIED        | Unblocks P24-T05, T06               |
| —   | Does the identifier search find a Location we created?                | **Yes**, `total: 1`, same id                                                                                                                                                                                                  | VERIFIED        | FR-LOC-07 adopt path                |
| —   | What does a second POST with the same identifier do?                  | **Refused**: 400 `duplicate`, "Found duplicate: Location (RuleNumber: 20002)". No second resource                                                                                                                             | VERIFIED        | Changes FR-LOC-07                   |
| —   | Is `Location.position` enforced?                                      | **No**, 201 without it, although the docs mark it mandatory                                                                                                                                                                   | VERIFIED        | FR-LOC-01 stays policy              |
| —   | Rename and deactivate by PUT                                          | **Both 200**                                                                                                                                                                                                                  | VERIFIED        | FR-LOC-08                           |
| —   | Newborn Patient under `nik-ibu`, duplicate POST, birth order          | **Cannot be exercised on this sandbox.** No published test NIK is accepted as a mother, and creating a mother fails with 500                                                                                                  | STILL UNKNOWN   | Blocks P24-T11 sandbox verification |
| Q6  | Is there a KYC sandbox?                                               | **An endpoint exists on staging** and expects an encrypted body; it cannot be completed without a registered key pair                                                                                                         | PARTLY VERIFIED | P24-T14/T16                         |
| —   | How does a midwife's profession show on Practitioner?                 | No sandbox midwife NIK is known, so not probed. A Practitioner read returns only `id`, `identifier`, `name`, `meta` (P21-T08), so no profession either way                                                                    | STILL UNKNOWN   | Nothing blocked                     |
| —   | Immunization mandatory elements                                       | **Today's mapper output is refused.** `reasonCode`, `primarySource`, `protocolApplied` are required; `lotNumber` + `expirationDate` for a new dose; performer function `AP`/`OP` for a new dose and `EP` for a historical one | VERIFIED        | Changes P24-T12                     |
| —   | Is an Encounter with `status: finished` accepted without a diagnosis? | **No**: 400, "Element not found: Encounter.diagnosis (RuleNumber: 10457)". `in-progress` without one is 201                                                                                                                   | VERIFIED        | Context for P24-T09                 |
| —   | Direct-admission registration shape (FR-IP-03)                        | A direct admission needs its own `Registration`: `Encounter.registrationId` is required and unique                                                                                                                            | VERIFIED (code) | P24-T09                             |

## 1. Location (FR-LOC-01..08, Q1)

Requests, in order, against `POST /Location`, `GET /Location?identifier=…` and `PUT /Location/:id`.
The identifier system was `http://sys-ids.kemkes.go.id/location/{SATUSEHAT_ORGANIZATION_ID}` with a
fresh UUID as the value, `managingOrganization` was the clinic Organization, and `position` used
Jakarta coordinates in the correct order (latitude −6.1754, longitude 106.8272).

| Request                                                                | Status | Result                                                       |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| POST site, `physicalType si`, no `partOf`                              | 201    | Created                                                      |
| POST poli, `physicalType ro`, `partOf` the site, **no `serviceClass`** | 201    | Created (**Q1: yes**)                                        |
| POST poli with no `position`                                           | 201    | Created: `position` is not enforced                          |
| GET by identifier of the poli                                          | 200    | `total: 1`, the same id                                      |
| POST again with the **same identifier**                                | 400    | `duplicate`, "Found duplicate: Location (RuleNumber: 20002)" |
| PUT the poli with a new `name`                                         | 200    | Renamed                                                      |
| PUT the poli with `status: inactive`                                   | 200    | Deactivated                                                  |

**What changes because of this:**

- **Q1 is answered yes.** A poli registers as a plain `ro` Location under the site. `serviceClass` belongs
  on rooms and beds only, as the PRD assumed.
- **FR-LOC-07's retry is safer than the PRD feared.** A retried POST after a timeout does not create a
  duplicate: the platform refuses it with 400 `duplicate` (RuleNumber 20002). The registration service
  must treat that 400 as "already registered" and adopt the id through the identifier search, **not** as
  a failure to show the admin. Searching before each POST (the PRD's design) still avoids the error
  entirely and stays the primary path.
- **`position` is optional on the platform** despite the docs. Requiring coordinates before
  registration (FR-LOC-01) remains a good rule, because the rawat-inap guide and the Location page mark
  it mandatory and production may enforce what staging does not, but it is our rule, not the sandbox's.
- The API documents no DELETE. The spike's own Locations were left `status: inactive`.

## 2. Newborn Patient (FR-NB-03, `multipleBirthInteger`)

**STILL UNKNOWN: the sandbox cannot exercise this flow with the identities available.**

| Request                                                                          | Status | Result                                            |
| -------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| GET `/Patient?identifier=https://fhir.kemkes.go.id/id/nik-ibu\|9271060312000002` | 200    | `total: 0`                                        |
| POST newborn, `nik-ibu` = `9271060312000002`, `multipleBirthInteger: 1`          | 400    | `exception`, "Patient with nik-ibu is not female" |
| Same with mothers `0000000000000000` and `1111111111111111`                      | 400    | "Patient with nik-ibu is not female"              |
| Same with mother `9999999999999999`                                              | 500    | "An unexpected internal error has occurred."      |
| POST an adult female Patient with a **synthetic** NIK, to create a mother        | 500    | "An unexpected internal error has occurred."      |

What this does establish:

- **The platform validates the mother.** It resolves the `nik-ibu` value to a Patient and refuses a
  mother who is not female. So FR-NB-04's "mother not found / NIK ibu belum tercatat" messages need a
  third case: **the mother's SATUSEHAT record is not female** (400, `exception`).
- **A NIK search returns no `gender`.** The Patient returned by `identifier=nik|…` carries only
  `active`, `id`, `identifier`, `meta` and `name`, so we cannot check the mother's gender ourselves before
  posting. The 400 is the only signal.
- The published sandbox test NIKs are all recorded as not female, and creating a Patient on staging
  fails with 500, so the duplicate-POST behaviour and whether a single birth takes `0` or `1` could not be
  observed. The docs' duplicate rule (name, birth date, gender, birth order) is recorded here unverified.

**Consequence for P24-T11:** its "live sandbox create" DoD cannot be met until a female test mother
exists on staging. Ask Kemenkes (or the onboarding contact) for one, or verify on the first production
clinic after P21-T06. Build P24-T11 against the documented contract, and treat 500 on Patient create as
retryable, not as a verdict about the baby.

## 3. KYC (Q6)

Evidence from P21-T01 (12 Sep 2026), not re-probed here:

```
POST {staging}/kyc/v1/challenge-code -> 200 {"metadata":{"code":"400"},"data":{"error":"Failed to decrypt message"}}
POST {staging}/kyc/v1/generate-url   -> 200 {"metadata":{"code":"400"},"data":{"error":"missing begin tag"}}
```

- **A KYC endpoint exists on staging.** It parses requests and expects the PEM-armoured encrypted body
  (FR-KYC-01), so Q6 is not "no sandbox".
- It cannot be completed here: the hybrid encryption needs a key pair registered with SATUSEHAT, and none
  exists for this deployment. The KYC documentation page now redirects to the docs index, so where the
  public key is obtained is not documented anywhere we can reach.
- **Consequence:** P24-T14 can be unit-tested against the documented encryption example and exercised
  against staging for transport errors. P24-T16's end-to-end verification still needs registered keys;
  FR-KYC-07's "disabled on sandbox" rule should key on "KYC keys not configured", not on "sandbox".

## 4. Immunization (FR-IM-01..05)

The probe first created an `in-progress` outpatient Encounter for sandbox patient `9271060312000002` and
practitioner `3313096403900009`. A `finished` Encounter without a diagnosis is refused: 400, "Element not
found: Encounter.diagnosis (RuleNumber: 10457)". It then posted Immunizations against that Encounter. Every
payload carried `status`, `vaccineCode`, `patient`, `encounter`, `occurrenceDateTime`, `recorded` and
`location`, and changed one thing at a time.

**Shaped like today's mapper output** (`mapImmunization`: no `recorded`, `primarySource`, `reasonCode`,
`protocolApplied` or performer `function`): **400**, refused on every one of

- "Element not found: Immunization.reasonCode (RuleNumber: 10105)"
- "Element not found: Immunization.primarySource (RuleNumber: 10292)"
- "Performer function must contains code EP (RuleNumber: 10307)"
- "Element not found: Immunization.protocolApplied (RuleNumber: 10450)"

So **every Immunization this codebase submits today is refused by staging**, independent of this PRD.

**Vaccine code.** The KFA search (`/kfa-v2/products/all?product_type=farmasi`) returns vaccine products
that the Immunization terminology does not all accept. `93026440` (a BCG product) is refused, "Code not
found: '93026440' in system http://sys-ids.kemkes.go.id/kfa (RuleNumber: 10103)", and `93023055` is
accepted. A clinic can therefore pick a real KFA vaccine the platform still refuses.

**With vaccine `93023055`** (full set = the elements above plus `primarySource: true`, `lotNumber`,
`expirationDate`, performer `function` `AP`, `reasonCode` `IM-Dasar`, `protocolApplied[0].doseNumberPositiveInt: 1`):

| Variant                                                              | Status | Result                                                               |
| -------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Full set                                                             | 201    | Accepted                                                             |
| Full set without `expirationDate`                                    | 400    | "Element not found: Immunization.expirationDate (RuleNumber: 10307)" |
| Full set without `lotNumber`                                         | 400    | "Element not found: Immunization.lotNumber (RuleNumber: 10306)"      |
| Historical: `primarySource: false`, function `EP`, no lot, no expiry | 201    | Accepted                                                             |
| Historical: `primarySource: false`, function `AP`                    | 400    | "Performer function must contains code EP (RuleNumber: 10307)"       |
| New dose: `primarySource: true`, function `EP`                       | 400    | "Performer function must contains code AP or OP (RuleNumber: 10307)" |
| `reasonCode` `IM-TidakAda` (not in the code system)                  | 400    | "Code not found … immunization-reason (RuleNumber: 10105)"           |

**The rules, as staging enforces them:**

- `reasonCode` is **required**, and validated against `http://terminology.kemkes.go.id/CodeSystem/immunization-reason`. `IM-Dasar` is accepted.
- `primarySource` is **required**.
- `protocolApplied` is **required**; `doseNumberPositiveInt: 1` is accepted.
- **A new dose** (`primarySource: true`) requires `lotNumber` and `expirationDate`, and performer function `AP` or `OP`.
- **A historical dose** (`primarySource: false`) needs neither lot nor expiry, and its performer function must be `EP`.
- Not tested: omitting `recorded` alone, and the routine-timing code list.

**Consequence for P24-T12** (FR-IM-01..05 need correcting, not just implementing):

1. `performer.function` depends on `primarySource`: `AP` for a dose given here, **`EP`** for a dose copied from
   a card or KIA book. The PRD says `AP` for both.
2. `reasonCode` is a MUST, not a SHOULD (FR-IM-03).
3. `protocolApplied` is mandatory, so a dose with no dose number cannot be sent. Either require the dose number
   on the form, or skip the resource with a named reason; never invent a default silently.
4. A new dose without `lotNumber` is refused as well as one without `expirationDate`, so FR-IM-02's required-field
   rule covers both.
5. A vaccine whose KFA code the terminology refuses fails the whole Immunization. The skip log (P21-T02) should
   carry that as its own reason, rather than failing the encounter's bundle.
6. Until P24-T12 ships, any encounter with an immunization fails SATUSEHAT submission on staging. If that shows up
   in pilot use before Sprint 29, it is a bug worth its own ticket.

## 5. Direct-admission registration shape (FR-IP-03)

Read from the code on `main` (`apps/api/prisma/schema.prisma`, `admission-flow.service.ts`):

- `Encounter.registrationId` is **required and unique**: one encounter per registration.
- `admitPatient` today takes an optional `sourceEncounterId` and creates no encounter or registration when
  it is absent, which is why a direct admission reaches SATUSEHAT with nothing.
- `RegistrationType` has `CONSULTATION` and `LAB_ONLY`. `Registration.queueNumber`, `queueDate` and the poli
  are nullable, so a registration that takes no queue ticket is already representable.

**Consequence for P24-T09:** a direct admission creates, in one transaction, a `Registration` (its own type,
suggested `ADMISSION`, with no queue number, so the poli queue and the daily ticket roll are untouched), an
`Encounter` for the admitting clinician on that registration, and the `Admission` with that encounter as its
source. A new `RegistrationType` value is an enum migration. Adding a type rather than reusing
`CONSULTATION` keeps the queue board, which lists consultation registrations, from showing a woman in labour
as waiting for a consultation.

## 6. Midwife Practitioner

Not probed: no sandbox practitioner NIK is known to belong to a midwife, and the published practitioner
table is wrong for nine of ten rows (`satusehat-sandbox-practitioners.ts`). A Practitioner read returns only
`id`, `identifier` (NIK masked to its last three digits), `name` and `meta` (P21-T08), so no response carries
a profession. **Consequence:** D-034's premise holds without it: a midwife links by the same NIK lookup as a
doctor, and the profession is our own field.

## Cleanup

The Locations created by this spike are `status: inactive` on staging. No Patient was created; every Patient
POST was refused. One `in-progress` Encounter and three accepted Immunizations (vaccine `93023055`) remain on
staging against the sandbox test patient; the API documents no DELETE. The probe scripts were not committed: they carried credentials from the environment and
are reproducible from the tables above.
