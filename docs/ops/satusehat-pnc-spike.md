# Findings — SATUSEHAT PNC use case against the live sandbox (P25-T12 / SJ-235)

Probed **2026-09-21** against the staging sandbox
`https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1` with this repo's own
credentials — never production. The probe script refused to run unless both
the FHIR and the auth base URL were the `-stg.` hosts. Patients were the
sandbox identities in
`apps/api/src/modules/satusehat/fixtures/satusehat-sandbox-patients.ts`
(`…0003` as the mother, `1111111111111111` as the baby) and the nurse
practitioner from the practitioner fixture.

Identifiers are scrubbed: `<org>` is our organization id, `<ihs>` a patient
IHS number, `<episode>` an EpisodeOfCare id. The repo is public.

The published PNC playbook
(`satusehat.kemkes.go.id/platform/docs/id/interoperability/pnc/`) was read the
same day and its codes were probed one by one.

## Summary — what the ticket assumed, and what the platform does

| Ticket / playbook assumption | Live answer |
| --- | --- |
| PNC type system `https://terminology.kemkes.go.id/CodeSystem/episodeofcare-type` | **Wrong scheme.** `https://` is refused — `Invalid coding system … (RuleNumber: 10110)`. The `http://` system (the one `SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM` already holds for ANC) is accepted with code `PNC`, display `Postnatal Care`. The ticket and the task brief both quoted `https://`. |
| Find the episode with `GET ?patient=&type=PNC&status=active` | **Confirmed.** Also `?identifier=<system>\|<value>&type=PNC` — see §2 for why the `type` matters. |
| KF identifier system `http://terminology.kemkes.go.id/CodeSystem/episodeofcare/puerperium`, values KF1–KF4 | **Confirmed, and validated.** KF1–KF4 accepted; `KF9` refused (`Identifier value not found … RuleNumber: 10117`). Unlike the ANC K code, this is a terminology system, not the org-scoped `sys-ids` one. |
| KF identifier alongside our encounter identifier | **Confirmed.** Both are stored, and the Encounter reads back with `episodeOfCare` pointing at the PNC episode. |
| Close by PATCH `finished` | **Confirmed**, with the ANC trap intact: a PATCH without `replace /patient` fails with `patient reference can't be empty`. The ANC operation list (`mapAntenatalEpisodeFinishOperations`) works for PNC unchanged. |
| KN neonatal coding — "not given by the playbook; probe, don't guess" | **Found.** Identifier system `http://terminology.kemkes.go.id/CodeSystem/episodeofcare/neonate`, values KN1–KN3. `KN9` refused; `…/neonatal` and `…/newborn` refused as unknown systems. The EpisodeOfCare type `Neonate` (display `Neonate`) exists in the same type system. See §4. |
| Nifas Observation codes | **All 13 playbook codes accepted**, with the value types the playbook uses (§3). The `clinical-term` codes are **validated** — an unknown `OC…` code and an unknown `OV…` answer are refused. |

## 1. EpisodeOfCare create

Accepted (`201`):

```json
{
  "resourceType": "EpisodeOfCare",
  "identifier": [
    { "system": "http://sys-ids.kemkes.go.id/episode-of-care/<org>", "value": "<pregnancy-episode-uuid>" }
  ],
  "status": "active",
  "type": [{ "coding": [{
    "system": "http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type",
    "code": "PNC",
    "display": "Postnatal Care"
  }] }],
  "patient": { "reference": "Patient/<ihs>" },
  "managingOrganization": { "reference": "Organization/<org>" },
  "period": { "start": "<birth instant>" }
}
```

The ANC duplicate rule applies to PNC as well: a second active PNC episode for
the same patient is refused with Rule 10109/10110 and no id, so the adopting
search runs before the create (identifier first, then `type=PNC&status=active`).

Of the five sandbox patients none carried an active PNC episode; one carried an
active `Neonate` episode opened by another organisation.

## 2. One identifier, two episodes

A pregnancy's ANC and PNC episodes both use our pregnancy row as their
identifier. The sandbox accepted an ANC episode created with **the same
identifier value** as an active PNC one, and:

- `?identifier=…|<value>` returns **both**;
- `?identifier=…|<value>&type=PNC` returns only the PNC one, `&type=ANC` only
  the ANC one.

So `SatusehatEpisodeOfCareClient.findEpisodeIdByIdentifier` gained an optional
`typeCode`, and the PNC adopt passes `PNC`. The ANC adopt is left as it was —
its search runs before a birth, when no PNC episode for that pregnancy can
exist yet — but it would pick the wrong one if that ever changed.

## 3. Nifas Observations

Each posted in its own transaction bundle against a real PNC Encounter; all
`200`:

| Finding | Code | Value |
| --- | --- | --- |
| Tanggal persalinan | LOINC `93857-1` | `valueDateTime` |
| Perdarahan pervaginam | SNOMED `289530006` | `valueBoolean` |
| Jumlah perdarahan | LOINC `81661-1` | `valueQuantity` mL |
| Kondisi perineum | SNOMED `364297003` | `valueString` |
| Tanda infeksi perineum | clinical-term `OC000020` | `valueBoolean` |
| Tanda infeksi luka jahitan SC | clinical-term `OC000025` | `valueBoolean` |
| Kondisi payudara | LOINC `32422-8` | SNOMED answer (`290084006` normal, `300885006`, `290070001`, `54302000`, `53430007`) |
| Kontraksi uteri | SNOMED `289700000` | `valueBoolean` |
| Warna lokhia | SNOMED `249214003` | SNOMED answer (`278072004` rubra, `449828001` serosa, `449827006` alba) |
| Bau lokhia | SNOMED `249215002` | `valueBoolean` |
| Produksi ASI | clinical-term `OC000017` | clinical-term answer (`OV000016` ada, `OV000017` sedikit, `OV000018` tidak ada) |
| BAK | SNOMED `102834005` | `valueBoolean` |
| BAB | SNOMED `300375001` | `valueBoolean` |

`OC999999` was refused (`Code not found … RuleNumber: 10010`) and `OV999999` as
an answer too (`RuleNumber: 10297`). The SNOMED and LOINC codes, as in the ANC
spike, were not shown to be validated — acceptance proves the code is
well-formed, not that it is right.

Blood pressure, pulse, temperature and respiration are the ordinary vital-sign
LOINC codes in the playbook, which the encounter's vital signs already send.
The playbook also lists gravida/para/abortus for PNC; they are **not** sent from
a nifas visit, because `pregnancy_episodes.para` is the count at booking and is
wrong the moment this birth happened.

**Not sent, and not probed:** vitamin A (the playbook gives no coding), and the
newborn-care and family-planning counselling flags (the playbook records
counselling as a Procedure — `408988007` for newborn care — which this ticket
did not build). All three are stored locally.

## 4. Neonatal visits (KN)

The KN identifier went on the baby's own Encounter with **no** `episodeOfCare`
reference and was accepted for KN1, KN2 and KN3. A `Neonate` EpisodeOfCare was
created (`201`) and closed (`200`) with the same PATCH shape, to leave the
sandbox clean.

What was **not** established: when the neonatal episode should close, and
whether the platform expects KN visits to reference it (the playbook mentions
an "UUID of the related neonatal EpisodeOfCare" on the Encounter update without
saying which Encounter). So the shipped code sends a baby's KN visit with its KN
identifier only, and opens **no** neonatal episode: an episode nothing here
closes would stay active and — under the one-active-per-type rule — block every
other clinic from opening one for that baby. That is an open question for
product, recorded in the PR.

## 5. What was left on the sandbox

The probe PNC and Neonate episodes, and one extra ANC episode used for §2, were
all PATCHed `finished`; no probe patient has an active PNC, ANC or Neonate
episode from us. The probe Encounters, Conditions and Observations stay —
nothing in the gateway deletes them.

## The shipping code, not just a hand-written payload

After the hand-built probes, the built mappers (`SatusehatPostnatalMapper` and
`SatusehatFhirMapper.mapEncounter` with `postnatalEpisode`, plus
`mapAntenatalEpisodeFinishOperations` for the close) were loaded from `dist/`
and their output posted as it came out:

```
EPISODE       201
BUNDLE        200   (Encounter + Condition + 13/13 nifas Observations)
FINISH        200
```

That episode was finished too.

## Still unverified

- The worker path — the enqueue, the adopt-before-create order and the stored
  id — is covered by unit and integration tests, not by a live encounter closed
  through the app.
- Twins: KN windows are per birth in the schedule, and each baby's visit is sent
  on her own Encounter; whether the platform wants one neonatal episode per baby
  is part of §4's open question.
