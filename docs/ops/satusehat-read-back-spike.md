# Findings — SATUSEHAT read-back against the live sandbox (P21-T01 / SJ-179)

Probed **2026-09-12** against the staging sandbox
`https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1`, organization
`0a1b2c3d-…3c4d`, using this repo's own credentials and a real encounter this
clinic submitted through the worker (`Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f`,
submitted 2026-09-11).

Recorded responses live in
`apps/api/src/modules/satusehat/fixtures/satusehat-read-back-fixtures.ts`. They
were captured from live calls, not hand-written — the lesson of
`satusehat-encounter-id-backfill-runbook.md`, where hand-made fixtures used a
relative `Location` URL and the parser passed every test then returned `null`
in production.

## Summary for the dependent tickets

| Ticket      | What changes because of this spike                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P21-T03** | The presence-only projection must be an **allowlist**, not a denylist: every resource carries the patient's name in `subject.display`. Concurrency 8 is safe; no 429 observed.                                                                                                                            |
| **P21-T04** | `Condition` has **no** `status` — it carries `clinicalStatus`. A comparison keyed on `status` shows a false "differs" on every diagnosis.                                                                                                                                                                 |
| **P21-T05** | `MedicationDispense?encounter=` is **silently ignored** and returns unrelated rows. Backfilling with it would attach another visit's dispense to this encounter. Use `context=` **plus** `subject=`. `Condition` and `Observation` carry no org-scoped identifier, so their local id cannot be recovered. |
| **P21-T08** | `GET /Practitioner/:id` returns **no `gender` and no `birthDate`**. The ticket's confirmation step must be built on name + NIK, which are the only identifying fields returned.                                                                                                                           |
| **P21-T07** | The KYC API is **not usable as the ticket assumes** — it requires an encrypted payload. See "KYC" below; this is a blocker, not an implementation detail.                                                                                                                                                 |
| **P21-T10** | 5 of the 8 candidate patient NIKs resolve to exactly one record; `9271060312000001` is ambiguous (2) and two published NIKs do not exist.                                                                                                                                                                 |

## 1. Read by id works for every type we send

`GET /<Type>/:id` returned `200` for Encounter, Condition, Observation,
Procedure, MedicationRequest, ClinicalImpression, Composition and Medication —
each read by the id our own submission recorded.

A missing id is a clean **`404`** with an `OperationOutcome` body, for all
eleven types probed (the eight above plus MedicationDispense, Immunization,
AllergyIntolerance):

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "no-store",
      "details": { "text": "storage_error" },
      "diagnostics": "resource not found: Condition/00000000-0000-4000-8000-000000000000"
    }
  ]
}
```

So "not found" is distinguishable from "error" without parsing prose: treat
`404` as not-found, everything else as an error. Note `code` is `no-store` and
`details.text` is `storage_error` — neither says "not found", so **match on the
HTTP status, never on those strings**.

## 2. Every resource carries the patient's name — the projection must be an allowlist

This is the finding that most affects P21-T03. The monitor is ADMIN-only and
promises "presence, never content", but the upstream payload puts identity in
fields that do not look clinical:

```json
"subject":   {"reference":"Patient/P00000000000","display":"<the patient's full name>"}
"performer": [{"actor":{"reference":"Practitioner/1b2c…","display":"<the doctor's name>"}}]
```

`subject.display` is present on **all seven** encounter-scoped types, and a
practitioner name appears in `participant`, `performer`, `requester`, `assessor`
and `author`. A denylist of "clinical" fields (`code`, `valueQuantity`, `note`,
`section`…) would pass the patient's name straight through to the front desk.

**Therefore:** P21-T03's projection must name the fields it keeps and drop
everything else. Per resource the only safe fields are
`resourceType`, `id`, `meta.versionId`, `meta.lastUpdated` and the status
(see §3). Nothing else — not `subject`, not `encounter`, not `identifier`.

Clinical-bearing keys observed per type, for the whitelist unit test to assert
are absent:

| Type               | Keys that must never reach an admin                                                       |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Encounter          | `diagnosis`, `subject`, `participant`, `location`                                         |
| Condition          | `code`, `category`, `subject`                                                             |
| Observation        | `code`, `valueCodeableConcept`, `interpretation`, `referenceRange`, `category`, `subject` |
| Procedure          | `code`, `note`, `subject`, `performer`                                                    |
| MedicationRequest  | `dosageInstruction`, `medicationReference`, `subject`, `requester`                        |
| ClinicalImpression | `finding`, `subject`, `assessor`                                                          |
| Composition        | `section`, `category`, `title`, `type`, `subject`, `author`                               |
| Medication         | `code`, `extension`                                                                       |

## 3. `Condition` has no `status` — it has `clinicalStatus`

| Type               | `status`    | note                             |
| ------------------ | ----------- | -------------------------------- |
| Encounter          | `finished`  | also `statusHistory`             |
| **Condition**      | **absent**  | carries `clinicalStatus` instead |
| Observation        | `final`     |                                  |
| Procedure          | `completed` |                                  |
| MedicationRequest  | `completed` |                                  |
| ClinicalImpression | `completed` |                                  |
| Composition        | `final`     |                                  |
| Medication         | `active`    |                                  |

Both P21-T03 ("the resource status") and P21-T04 (match/differs) must special-case
Condition, or every diagnosis reads as missing/differing.

`meta` is uniform and always present — `{"versionId": "...", "lastUpdated": "..."}` —
so both tickets can rely on it. `versionId` is an opaque string
(`MTc4OTE0MTU5NTg4MjIyOTAwMA`), not an integer: store and compare it as text.

## 4. Search by visit: `?encounter=` works — except for MedicationDispense, which silently lies

Confirmed filtering, by comparing a real encounter id against a syntactically
valid but nonexistent one:

| Type                   | `?encounter=<real>` | `?encounter=<fake>` | verdict                 |
| ---------------------- | ------------------- | ------------------- | ----------------------- |
| Condition              | 1                   | 0                   | filters                 |
| Observation            | 13                  | 0                   | filters                 |
| Procedure              | 1                   | 0                   | filters                 |
| MedicationRequest      | 1                   | 0                   | filters                 |
| ClinicalImpression     | 1                   | 0                   | filters                 |
| Composition            | 1                   | 0                   | filters                 |
| DiagnosticReport       | —                   | 0                   | accepted                |
| ServiceRequest         | —                   | 0                   | accepted                |
| **MedicationDispense** | **1**               | **1**               | **ignored — see below** |

`MedicationDispense?encounter=` returns `200` and a result **no matter what id
is passed**. Two different nonexistent encounter ids both returned the same
dispense row, whose actual `context` is a third encounter:

```
GET /MedicationDispense?encounter=00000000-0000-4000-8000-000000000000  -> total=1, id=5d4396be…
GET /MedicationDispense?encounter=00000003-0000-4000-8000-000000000003  -> total=1, id=5d4396be…
   that row's real context: Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f
```

The parameter is unsupported and **dropped instead of rejected**. Had P21-T05
followed the docs, the backfill would have stamped an unrelated dispense onto
every encounter it touched.

The documented form needs both parameters, and `context` alone is refused
explicitly (which is the good failure):

```
GET /MedicationDispense?context=<enc>                 -> 400 "Missing query parameters: subject"
GET /MedicationDispense?context=<enc>&subject=<pid>    -> 200, total=1, correct row
```

So **MedicationDispense read-back needs the patient's IHS number**, which this
repo stores encrypted. For P21-T05 that means either decrypting per row or
skipping dispenses; prefer resolving them from the stored `MedicationRequest`
ids instead, and leave dispense ids unknown for backfilled rows rather than
decrypting a patient identifier for a backfill.

## 5. Org-scoped identifiers: present on some types, absent on the two that matter most

P21-T05 planned to match SATUSEHAT resources back to local records through the
identifier we stamp (`http://sys-ids.kemkes.go.id/<type>/<org-id>`). Observed:

| Type               | `identifier`                                               |
| ------------------ | ---------------------------------------------------------- |
| Procedure          | `…/procedure/<org>`                                        |
| MedicationRequest  | `…/prescription/<org>` **and** `…/prescription-item/<org>` |
| ClinicalImpression | `…/clinicalimpression/<org>`                               |
| Composition        | `…/composition/<org>` — **an object, not an array**        |
| **Condition**      | **none**                                                   |
| **Observation**    | **none**                                                   |

Two shape traps for the backfill parser:

- `Composition.identifier` is a bare JSON **object**; the others are arrays.
  Code that does `identifier.map(...)` throws on Composition (it did, while
  probing).
- `MedicationRequest` carries **two** identifiers; matching must select by
  `system`, not take `identifier[0]`.

Condition and Observation confirm the ticket's own caveat: their local id stays
null on backfilled rows.

`Medication` is reachable from `MedicationRequest.medicationReference`
(`Medication/bf7b12da-…`), so the medication chain the ticket describes works.

## 6. Latency and concurrency — no rate limiting hit

12 `GET /Observation/:id` reads against the sandbox:

| Mode          | Total   | Per read |
| ------------- | ------- | -------- |
| Sequential    | 2712 ms | 226 ms   |
| 5 concurrent  | 635 ms  | —        |
| 12 concurrent | 312 ms  | —        |

All `200`; **no `429`, no throttling** at 12 parallel reads. A single read is
~180–230 ms.

**Recommended cap: 8.** A full encounter is up to ~20 resources; at 8 that is
~3 rounds, well under a second, and it leaves headroom on a shared sandbox
rather than optimising for a benchmark. The existing
`SATUSEHAT_REQUEST_TIMEOUT_MS` (30 s) and the circuit breaker already cover the
failure path.

## 7. No `_history`

Consistent with the docs: nothing suggests a `_history` endpoint. Version
comparison is limited to the current `meta.versionId`.

## 8. KYC (P21-T07) — blocked, and not for the reason the ticket assumes

The ticket assumes `POST /kyc/v1/challenge-code` takes a NIK and a name as
JSON. The endpoint exists on our sandbox credentials but rejects a plain
payload:

```
POST /kyc/v1/challenge-code   -> 200 {"metadata":{"code":"400",…},"data":{"error":"Failed to decrypt message"}}
POST /kyc/v1/generate-url     -> 200 {"metadata":{"code":"400",…},"data":{"error":"missing begin tag"}}
```

`Failed to decrypt message` and `missing begin tag` (a PEM armour error) show
the KYC API expects a **PEM-wrapped encrypted request body**, presumably under
a facility public/private key pair issued at onboarding. That is a different
and much larger piece of work than "a front-desk dialog", and none of the key
material is in this repo or its `.env.example`.

Also note the transport returns **HTTP 200 with an error code inside the body** —
unlike the FHIR endpoints. Any KYC client must read `metadata.code`, not the
HTTP status.

**Recommendation:** P21-T07 cannot be estimated at 5 points as written. It needs
the key-exchange requirement confirmed with Kemenkes first. Sprint 28's PRD
already supersedes it (P24-T14..T16); this spike is the evidence for closing it
rather than attempting it.

## 9. Sandbox patient NIKs, probed live (for P21-T10)

| NIK                | total | IHS              |
| ------------------ | ----- | ---------------- |
| `9271060312000002` | 1     | `P02029532758`   |
| `9271060312000003` | 1     | `P02029532781`   |
| `0000000000000000` | 1     | `P02029592967`   |
| `1111111111111111` | 1     | `P02029688251`   |
| `9999999999999999` | 1     | `P02029536465`   |
| `9271060312000001` | **2** | ambiguous — omit |
| `3524016901830001` | 0     | does not exist   |
| `3175031305200001` | 0     | does not exist   |

Same pattern as the practitioner table: the published list does not survive
contact with the sandbox. The five single-match NIKs are the fixture; the
repeated-digit ones work, matching `satusehat-sandbox-test-niks` notes.

## How to re-run

The probe is plain HTTP. Read credentials from `apps/api/.env`, get a token
from `POST {AUTH}/accesstoken?grant_type=client_credentials`, then
`GET {FHIR}/<Type>/<id>` with `Authorization: Bearer`. Nothing here writes to
the platform — every call is a read, safe to repeat.
