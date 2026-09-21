# Findings — SATUSEHAT ANC use case against the live sandbox (P25-T08 / SJ-231)

Probed **2026-09-21** against the staging sandbox
`https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1` with this repo's own
credentials, using the sandbox patients in
`apps/api/src/modules/satusehat/fixtures/satusehat-sandbox-patients.ts` and the
Sp.OG practitioner from the practitioner fixture.

Every identifier below is scrubbed: `<org>` is our organization id, `<other-org>`
another organisation's, `<ihs>` a patient IHS number, `<episode>` an
EpisodeOfCare id. The repo is public.

## Summary — what the ticket assumed, and what the platform does

| Ticket assumption | Live answer |
| --- | --- |
| Blocker: staging may refuse an ANC episode because no published sandbox NIK is female | **Not a blocker.** The episode was created (`201`) and no gender rule fired. The gateway exposes **no `gender` at all** — see §1 — so it cannot be checking one. |
| `EpisodeOfCare.type` is code `ANC` in `…/CodeSystem/episodeofcare-type` | **Confirmed**, with display `Antenatal Care`. The **ANC playbook's own example is wrong**: its `…/CodeSystem/episode-type` is rejected as an invalid coding system. |
| K identifier system `http://terminology.kemkes.go.id/CodeSystem/episodeofcare/ANC` | **Wrong, and so is the playbook's.** The system is `http://sys-ids.kemkes.go.id/episode-of-care/<org>` — hyphenated. The playbook's `…/episode/<org>` is rejected (Rule 10458). |
| Does `Encounter.identifier[0]` have to be the K identifier? | **No.** Either order is accepted, and both identifiers are stored. |
| May a 7th visit omit the K identifier? | **Yes** — an ANC Encounter with no K identifier, `episodeOfCare` still set, is accepted. |
| Must ANC weight and blood pressure be separate Observations? | **No.** Nothing requires an ANC-specific duplicate; the existing vital-sign codes and the ANC-specific ones are both accepted. Reuse `mapVitalSignsToObservations`. |
| Which LOINC codes does the platform accept for HIV, HBsAg, glucose? | **All of them.** The playbook's `68961-2` / `75410-1` / `74774-1` and our catalogue's `75622-1` / `5195-3` / `2345-7` were each accepted. There is no code allowlist — see §4. **Our lab catalogue needs no change.** |
| Search `?patient=&type=ANC&status=active` finds our episode so a retry can adopt it | **Confirmed**, and `?identifier=<system>\|<value>` works too. |

Three things the ticket did not ask about turned out to matter more than
anything it did: the duplicate rule (§2), the PATCH shape (§3), and the
`period.start` format (§2).

## 1. The gateway tells us nothing about a patient

`GET /Patient/<ihs>` returns only `active`, `id`, `identifier`, `meta` (and
sometimes `link`). **No `gender`, no `name`, no `birthDate`** — for all five
sandbox patients. The search bundle carries no more.

This closes the P24-T01 question in the only way that matters: we cannot read a
patient's sex from the platform, and the platform does not check ours. Two of
the five sandbox patients already carried an **active ANC episode created by
`<other-org>`**, which settles it from the other direction — somebody else has
been filing ANC episodes against these same test identities.

`sex` in our sandbox patient fixture stays what its comment already says it is:
a local placeholder, vouched for by nobody.

## 2. EpisodeOfCare create

Accepted payload (`201`):

```json
{
  "resourceType": "EpisodeOfCare",
  "identifier": [
    { "system": "http://sys-ids.kemkes.go.id/episode-of-care/<org>", "value": "K1M-<local-uuid>" }
  ],
  "status": "active",
  "type": [
    {
      "coding": [
        {
          "system": "http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type",
          "code": "ANC",
          "display": "Antenatal Care"
        }
      ]
    }
  ],
  "patient": { "reference": "Patient/<ihs>" },
  "managingOrganization": { "reference": "Organization/<org>" },
  "period": { "start": "2026-03-01T08:00:00+07:00" }
}
```

**`period.start` must be a full dateTime with an offset.** A date-only
`2026-03-01` is refused:

```
Invalid date time value : 2026-03-01 (RuleNumber: 10406)
Not Allowed : Future Date or Past Date before 3rd June 2014
```

HPHT is a `@db.Date` in our schema, so the mapper has to widen it to an instant
in the clinic timezone rather than pass the date through.

A UTC instant is fine — `new Date('2026-03-01T00:00:00+07:00').toISOString()`
was accepted and stored verbatim as `2026-02-28T17:00:00.000Z`. That is what
`toFhirInstant` already produces for every other resource, so the only work is
turning the date into clinic-local midnight first.

### The duplicate rule is the whole reason adopt-by-search exists

```
found duplicated EpisodeOfCare Type with status active. (Rule Number: 10109)
found duplicated EpisodeOfCare Type with status active. (Rule Number: 10110)
```

One **active** episode per patient per type, platform-wide. Consequences:

- A retry after a timeout that in fact landed cannot create a second episode —
  it is refused, not duplicated. The search is still what makes the retry
  *correct*, because the refusal carries no id.
- **The active episode may belong to another organisation.** Then there is no
  way to create ours, so the adopt has to take theirs. Search by our own
  identifier first (exact, ours), then fall back to `type=ANC&status=active`
  (whoever's) — and store whatever id comes back.
- Once the episode is `finished`, a new active one is accepted (`201`). A second
  pregnancy works, and the finish is what unblocks it.

## 3. Closing the episode: PATCH, and it must carry the patient

`PUT /EpisodeOfCare/<episode>` is **`403`** — "Operation cannot be performed due
to consent or privacy rules." The close is a PATCH.

The PATCH is an RFC 6902 operation list and the content type must be
`application/json-patch+json` (`application/json` is refused with
`invalid_headers`). But the validator does **not** read the stored resource:
every operation list must also **replace `/patient`**, or it fails with

```
EpisodeOfCare.status :: patient reference can't be empty
```

even for a one-line `replace /status`. This is the opposite of P24-T13's
`PATCH /Patient/<ihs>`, where the operation list stands on its own. What worked
(`200`, verified by reading the resource back):

```json
[
  { "op": "replace", "path": "/patient", "value": { "reference": "Patient/<ihs>" } },
  { "op": "replace", "path": "/status", "value": "finished" },
  { "op": "add", "path": "/period/end", "value": "2026-09-20T10:00:00+07:00" },
  { "op": "add", "path": "/statusHistory", "value": [
    { "status": "active", "period": { "start": "...", "end": "..." } },
    { "status": "finished", "period": { "start": "..." } }
  ] }
]
```

PATCH stays out of `IDEMPOTENT_METHODS` (P24-T13's rule): a replayed `add
/statusHistory` would append a second history.

## 4. Observations: no code allowlist

All 23 candidate codes were accepted (`201`), each posted on its own against a
real ANC Encounter:

| Group | Codes, all accepted |
| --- | --- |
| Obstetric status | `11996-6` gravida · `11977-6` partus · `69043-8` abortus · `8665-2` HPHT · `11778-8` HPL · `56077-1` pre-pregnancy weight |
| Visit | `18185-9` gestational age · `32418-6` trimester |
| Service | SNOMED `284473002` LiLA · `11881-0` fundal height · `883-9` blood type · `10331-7` rhesus |
| Foetal | `55283-6` foetal heart rate · SNOMED `249111004` head engagement · `89087-1` estimated foetal weight · `72155-5` presentation · SNOMED `246435002` foetal count |
| Labs, playbook | `68961-2` HIV · `75410-1` HBsAg · `74774-1` glucose |
| Labs, our catalogue | `75622-1` HIV · `5195-3` HBsAg · `2345-7` glucose |

Since **both** lab sets pass, the acceptance proves only that the code is
well-formed — it is not evidence that a code is the *right* one. The codes above
are the playbook's; the one thing the probe settles is that changing our lab
catalogue's LOINC codes is **not** required, which was the ticket's condition
for opening that as its own ticket. It stays closed.

`Observation.encounter` and `Observation.performer` are both mandatory
(Rules 10130, 10383).

## 5. Encounter

An ANC Encounter with `episodeOfCare` set was accepted in a transaction bundle,
and read back with both identifiers stored:

```json
{
  "identifier": [
    { "system": "http://sys-ids.kemkes.go.id/episode-of-care/<org>", "value": "K1M" },
    { "system": "http://sys-ids.kemkes.go.id/encounter/<org>", "value": "<local-uuid>" }
  ],
  "episodeOfCare": [{ "reference": "EpisodeOfCare/<episode>" }]
}
```

Order does not matter and the K identifier may be left out entirely, so a 7th
visit needs no special case. `Encounter.diagnosis` is mandatory
(Rule 10457) — an ANC visit that closes with no diagnosis cannot be sent, which
is already true of every other encounter we report.

## The shipping code, not just a hand-written payload

The findings above were first established with hand-built payloads. They were
then re-run against the sandbox using **`SatusehatFhirMapper`'s own output** —
`mapAntenatalEpisodeOfCare`, `mapAntenatalObservations` and
`mapAntenatalEpisodeFinishOperations`, built by the mapper with this
deployment's real configuration and posted as they came out:

```
EPISODE       201
OBSERVATIONS  17/17 accepted
FINISH        200
```

That is the live run this ticket's DoD asks for. What it does **not** cover is
the worker path: the enqueue, the adopt-before-create order and the transaction
bundle are covered by unit and integration tests, not by a live encounter
closed through the app.

## What was left on the sandbox

The probe episodes were finished and the probe patient has **no active ANC
episode left**, so the next live run can create one. The probe Encounters,
Condition and Observations stay — nothing in the gateway deletes them.

## Still unknown

- **TT immunization** was not probed: the Immunization mapping waits on
  P24-T12's mandatory fields. TT is skipped and the skip is recorded.
- Whether the platform ever enforces a coding **value set** for the ANC
  Observations. It did not here, so a wrong-but-well-formed code would be
  accepted silently. The codes in
  `satusehat-antenatal-observation-definitions.ts` are the playbook's, and the
  playbook has now been wrong twice (§2), so treat them as unverified against
  anything but their own documentation.
