# Runbook — switching SATUSEHAT from the sandbox to production (P21-T06)

## What this is for

A patient sees their visits in SATUSEHAT Mobile only if we send them to the
**production** platform. Verified 12 September 2026: `satusehat.config.ts`
defaults both base URLs to the staging sandbox
(`api-satusehat-stg.dto.kemkes.go.id`), `apps/api/.env.example` says to override
them for production, and no runbook covered the switch. So a green `SUBMITTED`
row proved the integration worked and proved nothing to the patient.

The integrations screen now states which platform is live (P21-T06), derived
from the configured base URL rather than a separate flag, so it cannot disagree
with where bundles actually go. Read that card before and after this procedure.

## The failure this procedure exists to prevent

**Sandbox ids mean nothing in production, and nine columns cache them.** A
production bundle that names a sandbox patient is the outcome to rule out — it
either fails, or worse, attaches this clinic's data to an unrelated national
record.

Every column that caches a platform id:

| Column                                                                          | What a non-null value does                                                                                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patient_profiles.satusehat_patient_id_ciphertext` (+ `_key_version`, `_last4`) | Used as the bundle's `subject` instead of looking the patient up again                                                                                                 |
| `doctor_profiles.satusehat_practitioner_id`                                     | Used as the encounter's practitioner instead of looking the doctor up again                                                                                            |
| `patient_allergies.satusehat_allergy_id`                                        | **Suppresses re-sending.** `findBundleData` selects allergies `WHERE satusehat_allergy_id IS NULL`, so a sandbox id means that allergy is never reported to production |
| `immunizations.satusehat_immunization_id`                                       | Provenance link for a reported vaccination (written since P21-T02)                                                                                                     |
| `satusehat_submissions.satusehat_encounter_id`                                  | Provenance link, and what a lab report references as its Encounter                                                                                                     |
| `lab_orders.satusehat_diagnostic_report_id`                                     | Provenance link for a released report                                                                                                                                  |
| `lab_order_items.satusehat_service_request_id`                                  | Provenance link per test                                                                                                                                               |
| `lab_specimens.satusehat_specimen_id`                                           | Provenance link per tube                                                                                                                                               |
| `lab_results.satusehat_observation_id`                                          | Provenance link per result                                                                                                                                             |
| `satusehat_submission_resources.satusehat_id` (P21-T02)                         | The read-back list; a sandbox id here makes "Check with SATUSEHAT" report not-found against production                                                                 |

**Decision (P21-T06): every cached SATUSEHAT id is cleared when an environment
changes.** Not migrated, not kept — cleared. There is no mapping between a
sandbox id and a production one, so keeping them preserves a reference to the
wrong platform, and clearing them makes the worker resolve each one again on
the next submission, which is the behaviour that was already correct on day
one. The allergy column is the one where keeping a stale id is actively
harmful rather than merely wrong, because it silently suppresses reporting.

The SQL to do it is in step 5. It is deliberately a manual, reviewed step in a
runbook rather than an automatic migration: it is destructive of provenance,
and a deployment that changes URLs for an unrelated reason (a proxy, a regional
endpoint) should not have its history wiped as a side effect.

## Before you start

- [ ] Production credentials issued by Kemenkes for **this facility**: client
      id, client secret, and the production **organization id**. They are
      different values from the sandbox ones; the organization id is not
      portable.
- [ ] A window with no clinical activity. Encounters close into the outbox, so
      submissions are in flight whenever the clinic is open.
- [ ] `git log` confirms the deployment includes P21-T02 (the resource list) and
      P21-T09 (NIK-change unlinking). Neither is required for the switch, but
      both change what the monitor tells you afterwards.

## Procedure

### 1. Drain the outbox

Let the worker finish, or stop it, but do not switch platforms with `PENDING`
rows waiting. A row claimed under the sandbox and processed after the switch is
sent to production with whatever ids it resolved earlier.

```sql
SELECT status, count(*) FROM satusehat_submissions GROUP BY status;
```

Wait until nothing is `PENDING`. `FAILED` rows are fine to leave — they are not
retried automatically, and step 5 clears their stale encounter ids.

### 2. Stop the worker

Set `SATUSEHAT_WORKER_ENABLED=false` and restart the API. This is what keeps
step 5 from racing a submission.

### 3. Create the production Location

The Encounter mapper requires `SATUSEHAT_LOCATION_ID`, and a sandbox Location id
does not exist in production. Register the clinic's Location on the production
platform through the SATUSEHAT portal (or the Location API) **before** the first
Encounter, and note its id.

An unset or wrong Location id fails at map time rather than silently — that is
deliberate — but it fails every submission until fixed, so do it before
reopening.

### 4. Point the configuration at production

```bash
SATUSEHAT_FHIR_BASE_URL="https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1"
SATUSEHAT_AUTH_BASE_URL="https://api-satusehat.dto.kemkes.go.id/oauth2/v1"
SATUSEHAT_KFA_BASE_URL="https://api-satusehat.dto.kemkes.go.id/kfa-v2"
SATUSEHAT_ORGANIZATION_ID="<production organization id>"
SATUSEHAT_CLIENT_ID="<production client id>"
SATUSEHAT_CLIENT_SECRET="<production client secret>"
SATUSEHAT_LOCATION_ID="<production Location id from step 3>"
SATUSEHAT_LOCATION_NAME="<the same name registered on the platform>"
```

The three URLs move together. The environment card reads the FHIR one, so a
half-switched deployment — production FHIR, sandbox auth — shows "Production"
while failing to authenticate; changing them as a set is what avoids that.

### 5. Clear every cached sandbox id

Restart the API on the new configuration first, confirm the environment card
says **Production**, then run this once, in a transaction, with the worker
stopped:

```sql
BEGIN;

-- Identity links. The worker resolves each again by NIK on the next submission.
UPDATE patient_profiles
   SET satusehat_patient_id_ciphertext = NULL,
       satusehat_patient_id_key_version = NULL,
       satusehat_patient_id_last4 = NULL
 WHERE satusehat_patient_id_ciphertext IS NOT NULL;

UPDATE doctor_profiles
   SET satusehat_practitioner_id = NULL
 WHERE satusehat_practitioner_id IS NOT NULL;

-- The one that matters most: a stale allergy id suppresses reporting for ever,
-- because unreported allergies are selected WHERE this column IS NULL.
UPDATE patient_allergies
   SET satusehat_allergy_id = NULL
 WHERE satusehat_allergy_id IS NOT NULL;

-- Provenance links to resources that exist only on the sandbox.
UPDATE immunizations SET satusehat_immunization_id = NULL
 WHERE satusehat_immunization_id IS NOT NULL;
UPDATE satusehat_submissions SET satusehat_encounter_id = NULL
 WHERE satusehat_encounter_id IS NOT NULL;
UPDATE lab_orders SET satusehat_diagnostic_report_id = NULL
 WHERE satusehat_diagnostic_report_id IS NOT NULL;
UPDATE lab_order_items SET satusehat_service_request_id = NULL
 WHERE satusehat_service_request_id IS NOT NULL;
UPDATE lab_specimens SET satusehat_specimen_id = NULL
 WHERE satusehat_specimen_id IS NOT NULL;
UPDATE lab_results SET satusehat_observation_id = NULL
 WHERE satusehat_observation_id IS NOT NULL;

-- The P21-T02 read-back list. Rows describing sandbox resources would make
-- "Check with SATUSEHAT" report not-found against production.
DELETE FROM satusehat_submission_resources;

COMMIT;
```

**What this costs, stated plainly:** the provenance link between local records
and everything ever sent to the sandbox is gone. That is the right trade — those
national records were never real — but it means the monitor cannot show detail
for any pre-switch submission, and P21-T05's backfill cannot recover it either
(it searches the platform the clinic is now pointed at). Historic rows keep
their status and their dates; they lose their ids.

**Do not run this when the URLs did not change.** It is not a maintenance
script.

### 6. Restart the worker and confirm with one real visit

Set `SATUSEHAT_WORKER_ENABLED=true`, restart, then:

- [ ] The integrations card says **Production** and names
      `api-satusehat.dto.kemkes.go.id`.
- [ ] Close **one** real encounter for a consenting patient and watch its row
      reach `SUBMITTED` with a fresh encounter id.
- [ ] Open that submission's detail and use "Check with SATUSEHAT" (P21-T03):
      every resource should be found.
- [ ] Ask that patient to open Resume Medis in SATUSEHAT Mobile. **This is the
      only check that proves the thing the switch was for.** It needs a verified
      profile (blue tick) and a PIN — see the KYC finding in
      `satusehat-read-back-spike.md`, and note the patient may not be verifiable
      at this clinic yet.

## Rolling back

Reverse steps 4 and 5: point the URLs and credentials back at the sandbox, and
run step 5's SQL again to clear the production ids. Production resources
already created **stay on the national record** — there is no documented FHIR
`DELETE` — so a rollback hides them from this deployment rather than removing
them. That asymmetry is the reason step 6 says _one_ visit.

## Related

- `satusehat-read-back-spike.md` — what read-back does on the live platform,
  including the KYC blocker behind Resume Medis.
- `satusehat-encounter-id-backfill-runbook.md` — the earlier backfill, and the
  reason its fixtures are recorded from live calls.
- P10-T19 (SJ-84) covers per-facility credentials for a multi-tenant
  deployment, which is blocked on multi-tenancy M3. This runbook is the
  single-facility switch.
