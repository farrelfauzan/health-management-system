# PRD: SATUSEHAT Readiness for Klinik Bidan

|                |                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Status         | Draft — for review                                                                                |
| Author         | Product (drafted with Claude Code)                                                                |
| Date           | 11 September 2026                                                                                 |
| Proposed phase | **Phase 24 — Klinik Bidan & SATUSEHAT Readiness** (`P24-T01` … `P24-T17`), Sprints 28–30          |
| Depends on     | Phase 10 (SATUSEHAT), IMP-14/15/16 (inpatient), P21-T02 (keep SATUSEHAT ids), P21-T06 (production switch), P21-T09 (NIK change), P22-T01 (D-033 record access), P20-T04 (staff profile) |
| Stakeholders   | Clinic owner (bidan), bidan, front desk, clinic admin, engineering                                |

---

## 1. Summary

Our first prospects are **klinik bidan**: clinics run by midwives. Their daily work is antenatal care, normal delivery, postpartum and newborn care, family planning and infant immunisation. Today the product fails them in four places. It only knows doctors as clinicians. It cannot report a baby to SATUSEHAT until the baby has a NIK. It reports every visit and every hospital stay at one clinic-wide Location. And it has no KYC.

This PRD specifies five epics:

- **(E1)** a `MIDWIFE` role that is a full clinician
- **(E2)** SATUSEHAT Locations per poli and per ward, room and bed
- **(E3)** SATUSEHAT identities for newborns, plus the immunisation elements the IG makes mandatory
- **(E4)** patient KYC at the front desk
- **(E5)** the two inpatient reporting holes a birth stay falls into

ANC/KIA clinical records are deferred by product decision (11 September 2026).

Most of the machinery already exists: the clinician aggregate (`DoctorProfile`), the inpatient module (`admission-flow`, `room-management`), `Immunization` recording, the SATUSEHAT outbox, and the encrypted-identifier pattern. This phase extends it. It does not replace it.

---

## 2. Problem & Context

### 2.1 A midwife cannot be the clinician

`DoctorProfile` is the only clinician aggregate. Fourteen foreign keys point at it, including `Encounter.doctorId`, `Admission.admittingDoctorId`, `Prescription.doctorId` and `Immunization.performedById`. The seeded roles are `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PHARMACIST`, `PATIENT`, `LAB_TECHNICIAN` and two system roles (`apps/api/prisma/seed.sql:18-41`). There is no `MIDWIFE` and no `NURSE`.

The workaround is to register a bidan as a doctor. Their SATUSEHAT reporting then works by accident, because the Practitioner lookup by NIK does not care about profession. But everything else is wrong:

- The admin UI, invitations and licence tracking all call her a doctor.
- She can prescribe anything in the catalogue, which Permenkes 28/2017 does not allow.
- The pending access rule (P22-T01, "only doctors may access patient records") would lock her out of her own patients the day it ships.

### 2.2 The baby is invisible to SATUSEHAT

`PatientProfile.nik` is nullable on purpose (`packages/shared-types/src/patient-management/schemas.ts:505` says "newborns have no NIK for weeks"). But the SATUSEHAT side has no path for such a patient:

- Linking returns 422 without a NIK (`satusehat-link.service.ts:95-97`).
- The submission worker throws "Patient has no NIK on record" (`satusehat-submission.service.ts:1233`).
- Nothing links a baby to its mother.
- No code ever creates a Patient on SATUSEHAT: `mapPatientAddress` has no caller.

In a klinik bidan the newborn is the most frequent reportable subject: the HB0 dose, the neonatal visit, the stay after birth. Every one of those submissions fails until the baby's NIK arrives, weeks later. SATUSEHAT has a documented flow for exactly this case: a newborn Patient keyed on the mother's NIK (`nik-ibu`).

### 2.3 Every visit happens "at the clinic"

There is one Location per deployment: the env value `SATUSEHAT_LOCATION_ID`. It is used for outpatient and inpatient Encounters alike (`satusehat-fhir.mapper.ts:247-286`, `:1114-1144`). `Specialty` (our poli) and the `Ward`/`Room`/`Bed` inventory have no Location id.

The SATUSEHAT rawat-inap guide makes `Encounter.location[]` mandatory. It expects one entry per bed, each with a period and a `serviceClass` extension (kelas perawatan). We send one clinic-wide reference for a three-day stay.

### 2.4 Patients cannot see what we report

SATUSEHAT Mobile shows a patient's resume medis only on a verified profile. One way to verify is KYC at a facility: the front desk enters the patient's SATUSEHAT Mobile access code in the EMR's KYC screen. The repo has no KYC code and no design. P21-T07 (SJ-185) was filed as a placeholder.

### 2.5 Two inpatient reporting holes

- **A direct admission is never reported.** `enqueueSatusehatEncounter` returns early when `sourceEncounterId` is null (`admission-flow.repository.ts:235-237`). A woman who arrives in labour and goes straight to a bed is exactly this case.
- **`dischargeDisposition` is always `home`.** D-030 deferred it until staff had somewhere to enter it. The discharge schema has only `dischargedAt` and `dischargeSummary` (`packages/shared-types/src/admission-flow/schemas.ts:75-78`).

### 2.6 Immunization is missing mandatory elements

The SATUSEHAT immunisation guide marks these as mandatory: `status`, `vaccineCode`, `patient`, `encounter`, `occurrence`, `recorded`, `primarySource`, `expirationDate`, `performer.function` and `performer.actor`.

Our mapper (`satusehat-fhir.mapper.ts:653-700`) sends no `recorded`, no `primarySource` and no `performer.function`, and it omits `expirationDate` when the row has none. It also sends no `reasonCode`, which is the program category (imunisasi dasar, baduta, and so on). Separately, `satusehatImmunizationId` is never written, so a resubmission POSTs every vaccination again. P21-T02 already covers that part.

---

## 3. Goals & Success Metrics

| ID  | Goal                                           | Metric                                                                                  | Baseline                     | Target                                   |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| G1  | A midwife works as herself                     | Encounters closed by a `MIDWIFE` whose SATUSEHAT participant is her own Practitioner    | Impossible (no role)         | 100%                                     |
| G2  | Newborns reach the national record             | Share of submissions for patients without a NIK that end `SUBMITTED`                    | 0% (all `FAILED`)            | ≥ 95% within 24 h of the visit closing   |
| G3  | Every visit names where it happened            | Share of submitted Encounters that reference a poli or bed Location, not the root       | 0%                           | 100% once the clinic's Locations are registered |
| G4  | Every stay is reported                         | Discharged admissions with an `ENCOUNTER` submission row                                | Only those with a source visit | 100%                                   |
| G5  | Immunizations pass the IG                      | Immunization entries rejected for a missing mandatory element                            | Unmeasured                   | 0                                        |
| G6  | Patients can verify at the desk                | KYC sessions started from the EMR in production                                          | 0 (no feature)               | ≥ 1 per pilot clinic in its first week   |

---

## 4. Non-Goals

- **ANC, persalinan, nifas and KB clinical records** (partograf, APGAR, KIA book, birth certificate). Deferred by product decision on 11 September 2026. They come back in the phase after this one, and E1 and E3 are their prerequisites.
- **Enforcing Permenkes 28/2017 delegated authority** (program immunisation beyond HB0, IUD/implant, MTBS). E1 only enforces the prescribing boundary, because that is the one that is cheap and clear. See Q3.
- **A `NURSE` role.** Same shape as E1, but no prospect needs it yet.
- **Renaming `DoctorProfile`, the `/doctors` API or the `/doctor` portal routes.** See D-034 in §7.1. The renames would churn 14 foreign keys, the generated Prisma client and the Orval client for no user-visible gain.
- **SATUSEHAT sub-organisations.** A Location's `managingOrganization` may point at the parent Organization (documented stage 1).
- **Real-time bed occupancy sync** (`Location.operationalStatus` O/U).
- **Creating the mother on SATUSEHAT when she is not found.** Every NIK holder is expected to exist in the national MPI. A miss is surfaced to staff, not worked around.
- **The discharge-condition `Condition`** (SNOMED stable/unstable/improved).
- **BPJS inpatient claims.**

---

## 5. Personas & Primary Journeys

| Persona               | What they do                                                             | What they need from this phase                                                              |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Bidan** (`MIDWIFE`) | Examines, delivers, vaccinates, admits and discharges her own patients   | To be the clinician on the record, to prescribe what her licence allows, and to register a newborn in two clicks |
| **Front desk** (`ADMIN`) | Registers patients, runs the queue, handles check-in                   | A KYC button that works, and newborn registration without typing the mother's address again |
| **Clinic owner / admin** | Sets up the clinic and its staff                                       | Register poli, wards, rooms and beds on SATUSEHAT once, and see what is not registered yet  |
| **Mother** (`PATIENT`)   | Gives birth, brings the baby back for vaccinations                     | Her baby's record appears in SATUSEHAT Mobile, and so does her own after KYC                |

---

## 6. Current State in the Codebase

| Area | Exists today | Missing |
| --- | --- | --- |
| Clinician | `DoctorProfile` (`schema.prisma:1560`): STR as `licenseNumber` (D-032), encrypted NIK, `satusehatPractitionerId`, `ownerUserId`. `DoctorLicense` STR/SIP with expiry notices | Profession; a `MIDWIFE` role; one shared list of clinician role codes (the string `'DOCTOR'` is checked in 12 service files) |
| Ownership | Access services key on `DoctorProfile.ownerUserId` (encounter, admission, lab order, patient document). `findActiveDoctorByOwnerUserId` is duplicated in 4 repositories | Nothing. These work for any profession, which is why E1 extends the profile instead of adding one |
| Web gate | `proxy.ts:23-27` `DOCTOR_ROLES = ['DOCTOR']`, doctor home `/doctor/dashboard`, `shell-profile.ts` role label | `MIDWIFE` in the clinician gate and a "Bidan" label |
| Poli | `Specialty` with `bpjsPoliCode`. Only `GET /specialties`; no admin page | A SATUSEHAT Location id |
| Inpatient | Ward → Room → Bed, `RoomClass` master data, `Admission` + `BedAssignment` history, IMP at discharge with `hospitalization` (D-030). Gated by the `room-management` entitlement | Location ids, a class-to-SATUSEHAT mapping, a disposition, reporting of direct admissions |
| Clinic | `ClinicProfile`: name, free-text address, facility id | Latitude/longitude, which `Location.position` requires |
| Patient | Encrypted NIK (nullable), wilayah codes, `guardianName`/`guardianRelation` as free text | A mother link, a birth order, and any way to create a SATUSEHAT Patient |
| Immunization | Model + mapper: KFA vaccine, lot, expiry, dose, route, site (PR #268). Recorded via `POST /encounters/:id/immunizations` | `recorded`, `primarySource`, `performer.function`, `reasonCode`, a Location; id persistence (P21-T02) |
| SATUSEHAT client | `satusehat-http.client.ts` sends any method and path; retries only GET/PUT/DELETE. The master-data client does NIK lookups only | Location, Patient-create and KYC calls |
| Outbox | `SatusehatSubmissionKind = ENCOUNTER \| LAB_REPORT`; three producers, one worker | No new kind needed (see E3 and E5) |
| KYC | Nothing | Everything |

**Must not break:** doctor onboarding and every doctor flow, the `ENCOUNTER` and `LAB_REPORT` outbox semantics (one row per encounter, lab held until its encounter settles), and deployments that only set `SATUSEHAT_LOCATION_ID`. That env value stays as the fallback root Location.

---

## 7. Epics

### 7.1 E1 — Midwife as a clinician (`MIDWIFE`)

**Outcome** — A bidan is onboarded, examines, prescribes within her licence, admits and discharges, and is reported to SATUSEHAT as herself.

**Decision D-034 — A midwife is a profession on the clinician profile, not a second aggregate.** `DoctorProfile` gains a `profession` column. Every foreign key, access service and SATUSEHAT Practitioner lookup already works for any profession, because each one keys on the profile, not on the role name. A separate `MidwifeProfile` would double 14 foreign keys and every access check. The model keeps its name. The UI calls the set "Tenaga klinis".

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-MW-01 | MUST | `DoctorProfile.profession` (`ClinicianProfession`: `DOCTOR`, `MIDWIFE`), not null, default `DOCTOR`. Existing rows backfill to `DOCTOR` |
| FR-MW-02 | MUST | Seed role `MIDWIFE` with DOCTOR's clinician grants (`seed.sql:644-888`) except `lab-result.verify:any`. Signing out a lab result is not among the midwife's own authorities in Permenkes 28/2017 Pasal 19–21 |
| FR-MW-03 | MUST | Creating a clinician derives the invitation role from `profession` (`MIDWIFE` → `roleCodes: ['MIDWIFE']`). `profession` can be edited only while the profile has no encounter, admission or prescription (422 `CLINICIAN_PROFESSION_LOCKED`) |
| FR-MW-04 | MUST | Every role-code check that means "a clinician" reads one `CLINICIAN_ROLE_CODES` constant: `lab-result.service.ts:57`, `doctor-management.service.ts:43`, `user-invitation.service.ts:42`, `vault-document-access.service.ts:65`, `personal-document.service.ts:336`, `user-offboarding.service.ts:262`, `chat-tool.registry.ts:22`, and the five chat tools' `allowedRoleCodes` |
| FR-MW-05 | MUST | `proxy.ts` treats `MIDWIFE` as a clinician session (same `/doctor/*` portal). The shell labels the role "Bidan" |
| FR-MW-06 | MUST | `Medication.isMidwifePrescribable` (default false). A `MIDWIFE` prescription line for an unflagged item is refused with 422 `MEDICATION_NOT_MIDWIFE_PRESCRIBABLE`. Her picker lists only flagged items. The clinic sets the flags; the seed sets none |
| FR-MW-07 | MUST | `/admin/doctors` becomes "Tenaga klinis": a profession column and filter, and a profession select on create |
| FR-MW-08 | MUST | D-034 is recorded in `docs/post-mvp/decisions.md`. P22-T01's D-033 says "clinicians (`DOCTOR`, `MIDWIFE`)" wherever it would have said "doctors" |
| FR-MW-09 | SHOULD | Licence tracking (STR/SIP, expiry notices) works for midwives unchanged. Copy says "STR/SIP" without "dokter" |

**User stories**

- **US-MW-01** — As a clinic admin, I want to register a bidan as a clinician, so that she can log in and see her own patients.
  - *Given* an admin with `doctor.create:any`, *when* they `POST /api/v1/doctors` with `profession: "MIDWIFE"`, a NIK and an STR, *then* the profile is created with `profession = MIDWIFE` and the invitation carries `roleCodes: ["MIDWIFE"]`.
  - *Given* she accepts the invitation, *when* she signs in, *then* she lands on `/doctor/dashboard` and the shell reads "Bidan".
- **US-MW-02** — As a bidan, I want my encounters reported under my name, so that the national record shows who examined the patient.
  - *Given* a midwife whose NIK resolves to IHS `10009880728`, *when* she closes an encounter, *then* the bundle's `Encounter.participant[0].individual.reference` is `Practitioner/10009880728`.
- **US-MW-03** — As a clinic owner, I want a midwife limited to the medicines her licence allows, so that the clinic is not exposed.
  - *Given* "Amoxicillin 500 mg" is not flagged, *when* a midwife adds it to a prescription, *then* the API returns 422 `MEDICATION_NOT_MIDWIFE_PRESCRIBABLE`.
  - *Given* "Tablet Tambah Darah (Fe)" is flagged, *when* she adds it, *then* the line is saved.
- **US-MW-04** — As a bidan, I want the same patient access a doctor has, so that I can care for my patients.
  - *Given* a patient assigned to her through `DoctorPatient`, *when* she opens `/doctor/patients/:id`, *then* she gets 200.
  - *Given* a patient not assigned to her, *when* she opens the same URL, *then* she gets the same response a doctor would.

**Data model delta** — enum `ClinicianProfession`; `doctor_profiles.profession` (default `'DOCTOR'`, indexed); `medications.is_midwife_prescribable boolean not null default false`.

**API surface** — `POST/PATCH /api/v1/doctors` accept `profession`. `GET /api/v1/doctors?profession=MIDWIFE`. The medication create/update routes accept `isMidwifePrescribable`. No new routes.

**RBAC** — new role `MIDWIFE`, no new permission keys. Re-run `pnpm db:seed` after deploy. Add `MIDWIFE` wherever web code enumerates roles. Its permissions reach the web through the session-hint cookie, so no new CASL action is needed.

**UX** — `apps/web/app/admin/doctors` (server) composes `components/client/doctors/*`; the profession select lives in the existing create/edit form. The midwife uses the existing doctor portal.

**Edge cases** — A user who holds both `ADMIN` and `MIDWIFE` gets the admin portal (admin wins today, `proxy.ts:64-67`). A midwife converted from a doctor-registered workaround needs a SUPER_ADMIN data fix, because FR-MW-03 locks profession once history exists. That is deliberate: history must not silently change who treated a patient.

---

### 7.2 E2 — Locations per poli and per bed

**Outcome** — Every submitted Encounter names the poli or the beds where care happened, and the clinic can see which of its rooms are registered on SATUSEHAT.

**The Location tree the clinic registers:**

```
Organization (SATUSEHAT_ORGANIZATION_ID)
└── Site — the clinic                      physicalType si
    ├── Poli KIA                           physicalType ro   ← Specialty
    ├── Poli Umum                          physicalType ro   ← Specialty
    └── Bangsal Melati                     physicalType wa   ← Ward
        └── Kamar 1 · Kelas 2              physicalType ro   ← Room   serviceClass 2
            ├── Bed 1                      physicalType bd   ← Bed    serviceClass 2
            └── Bed 2                      physicalType bd   ← Bed    serviceClass 2
```

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-LOC-01 | MUST | `ClinicProfile.latitude` / `longitude` (decimal degrees). Location registration is refused until both are set. The official page's example swaps the two, so the form validates latitude within −11…6 and longitude within 95…141 (Indonesia's bounding box) |
| FR-LOC-02 | MUST | A root site Location (`si`) for the clinic, stored in the database. `SATUSEHAT_LOCATION_ID` stays as the fallback root while none is registered |
| FR-LOC-03 | MUST | Each active `Specialty` registers as `ro`, `partOf` the root |
| FR-LOC-04 | MUST | `Ward` → `wa` (partOf root), `Room` → `ro` (partOf its ward), `Bed` → `bd` (partOf its room). Rooms and beds carry the `LocationServiceClass` extension from their `RoomClass` |
| FR-LOC-05 | MUST | `RoomClass.satusehatServiceClass` (`CLASS_1`, `CLASS_2`, `CLASS_3`, `VIP`, `VVIP`), mapped to `1`, `2`, `3`, `vip`, `vvip`. Classes above VVIP map to VVIP, per the Location page. Rooms of an unmapped class cannot be registered, and the message names the class |
| FR-LOC-06 | MUST | Identifier system `http://sys-ids.kemkes.go.id/location/{organization-id}`; value = our row UUID (stable, unlike the editable `code`) |
| FR-LOC-07 | MUST | An admin triggers registration, per row or for everything unregistered. Parents register before children. Before each POST the service searches `GET /Location?identifier=…`, so a retried registration adopts the existing resource instead of creating a duplicate |
| FR-LOC-08 | MUST | Renaming a registered row PUTs the new name. Deactivating or soft-deleting it PUTs `status: inactive` |
| FR-LOC-09 | MUST | An outpatient Encounter references the Location of its registration's specialty. When that poli is not registered, it falls back to the root, and the submission monitor shows a "fallback location" warning |

**User stories**

- **US-LOC-01** — As a clinic admin, I want to register all my poli, wards, rooms and beds in one action, so that SATUSEHAT knows where care happens.
  - *Given* coordinates are set and 2 poli, 1 ward, 2 rooms and 4 beds are unregistered, *when* the admin clicks "Daftarkan semua", *then* 10 Locations are registered, root first, and each row shows its SATUSEHAT id.
- **US-LOC-02** — As a clinic admin, I want registration to survive a timeout, so that a retry does not create duplicates.
  - *Given* a POST for "Bed 2" timed out after SATUSEHAT created it, *when* the admin retries, *then* the identifier search finds it and the row adopts that id without a second POST.
- **US-LOC-03** — As SATUSEHAT, I receive the poli where a visit happened.
  - *Given* a registration for "Poli KIA", registered as `Location/ab12…`, *when* the encounter closes, *then* `Encounter.location[0].location.reference` is `Location/ab12…`.

**Data model delta** — nullable `satusehat_location_id` on `specialties`, `wards`, `rooms`, `beds`; a `satusehat_location_id` for the root on `clinic_profiles`; `clinic_profiles.latitude/longitude decimal(9,6)`; enum `SatusehatServiceClass` and nullable `room_classes.satusehat_service_class`.

**API surface**

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/satusehat/locations` | `satusehat-location.read:any` | The tree above with a per-node status: `REGISTERED`, `UNREGISTERED`, `BLOCKED` plus a reason |
| POST | `/api/v1/satusehat/locations/register` | `satusehat-location.write:any` | Body `{ targets: [{ kind, id }] }` or `{ all: true }`. Response: per-target outcome |

**RBAC** — new keys `satusehat-location.read:any` and `satusehat-location.write:any`, granted to `ADMIN`. `read` and `write` are already in `SUPPORTED_ACTIONS`, but the ADMIN preset still needs the new resource, or the panel never renders. Both routes are `@RequireFeature('satusehat')`.

**UX** — a "Lokasi SATUSEHAT" panel on `/admin/integrations`, next to the BPJS mappings panel: a tree, a status chip per node, "Daftarkan" per node and "Daftarkan semua". Coordinates go on the clinic profile form.

**Edge cases** — A child whose parent is unregistered is `BLOCKED`, not failed. A 4xx from SATUSEHAT is shown verbatim in the node's reason. A ward deleted after registration is marked inactive, never deleted, because Encounters already point at it.

---

### 7.3 E3 — Newborn identity and immunisation completeness

**Outcome** — A baby born at the clinic is reported to SATUSEHAT from her first vaccination, under her mother's NIK. Every immunisation carries the elements the IG requires.

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-NB-01 | MUST | `PatientProfile.motherPatientId` (self-reference, nullable, indexed) and `birthOrder` (int ≥ 1, required when `motherPatientId` is set). "Newborn" means `motherPatientId` is set. The existing free-text guardian fields stay |
| FR-NB-02 | MUST | "Daftarkan bayi" on the mother's patient page and on her active admission. It prefills name "Bayi Ny. {mother}", date of birth (today), address and wilayah codes from the mother, and the next birth order. NIK stays empty |
| FR-NB-03 | MUST | Resolving the IHS number for a patient without a NIK but with a mother: take the mother's NIK, `GET /Patient?identifier=https://fhir.kemkes.go.id/id/nik-ibu\|{nik}`, and pick the entry whose `birthDate` and `multipleBirthInteger` match. If none matches, `POST /Patient` with the `nik-ibu` identifier. Store the IHS number on the baby and audit `SATUSEHAT_PATIENT_CREATED` or `SATUSEHAT_PATIENT_LINKED` (`lookup: 'NIK_IBU'`) |
| FR-NB-04 | MUST | A mother without a NIK, or not found on SATUSEHAT, fails the baby's submission with a distinct message ("NIK ibu belum tercatat" / "Ibu tidak ditemukan di SATUSEHAT"), not the generic "Patient has no NIK" |
| FR-NB-05 | MUST | Adding a first NIK to a newborn that already has an IHS number PATCHes that SATUSEHAT Patient (SATUSEHAT checks NIK + name + birth date against Dukcapil) and keeps the IHS number. P21-T09's unlink-on-NIK-change rule exempts this case. A rejection is shown to the admin; the NIK is saved locally either way |
| FR-IM-01 | MUST | Immunization sends `recorded` (row `createdAt`), `primarySource`, and `performer[].function` = `AP` (administering, `v2-0443`) next to the actor |
| FR-IM-02 | MUST | New `Immunization.isHistorical` (default false) for doses copied from a card or KIA book. `primarySource = !isHistorical`. A new, non-historical dose requires `expirationDate` (400 from the shared schema). A historical dose without one is kept locally and skipped in the bundle, with the gap named in the skipped-items log (P21-T02) |
| FR-IM-03 | SHOULD | `Immunization.reason` (`ImmunizationReason`) → `reasonCode` in `http://terminology.kemkes.go.id/CodeSystem/immunization-reason`: `IM-Dasar`, `IM-Baduta`, `IM-SD`, `IM-WUS`, `IM-Tambahan`, `IM-Khusus`, `IM-Pilihan`. Routine timing (`immunization-routine-timing`) follows once the spike confirms the full code list |
| FR-IM-04 | MUST | `Immunization.location` = the poli Location from E2 when registered |
| FR-IM-05 | MUST | Depends on P21-T02: `satusehatImmunizationId` is persisted, and a resubmission never POSTs the same dose twice |

**User stories**

- **US-NB-01** — As a bidan, I want to register a newborn from the mother's record, so that I don't retype her address.
  - *Given* mother "Siti Aminah" with wilayah codes and one earlier child, *when* the bidan clicks "Daftarkan bayi" and picks female, *then* a patient "Bayi Ny. Siti Aminah" is created with `motherPatientId` set, `birthOrder = 2`, the mother's address, and no NIK.
- **US-NB-02** — As SATUSEHAT, I receive the HB0 dose on the day of birth.
  - *Given* that newborn received HB0 in an encounter that closed, *when* the worker runs, *then* it finds no `nik-ibu` match, POSTs a Patient with the mother's NIK, stores the returned IHS number, and the bundle's `Immunization.patient` references it.
- **US-NB-03** — As a front desk officer, I want the baby's record to survive her NIK arriving.
  - *Given* a newborn with IHS `P0123…`, *when* staff enter her NIK, *then* the SATUSEHAT Patient is PATCHed and `P0123…` remains her IHS number.
- **US-IM-01** — As a bidan, I want to record a dose copied from a KIA book without inventing an expiry date.
  - *Given* "historis" is ticked and there is no expiry, *when* she saves, *then* the dose is recorded, and the next bundle skips it with reason `IMMUNIZATION_EXPIRY_MISSING`.

**Data model delta** — `patient_profiles.mother_patient_id uuid null` (FK, `Restrict`), `patient_profiles.birth_order int null` with `CHECK (mother_patient_id IS NULL OR birth_order >= 1)`; `immunizations.is_historical boolean not null default false`; enum `ImmunizationReason` and nullable `immunizations.reason`.

**API surface** — `POST /api/v1/patients/:motherId/newborns` (`patient.create:any`; for a midwife, `patient.create:own` scoped to her patients), body `{ sex, dateOfBirth?, birthOrder?, placeOfBirth? }`. The existing immunisation route accepts `isHistorical` and `reason`.

**RBAC** — `MIDWIFE` and `ADMIN` hold the create key. There is no new resource.

**UX** — the button on `components/client/patients/*` (patient detail) and on the admission detail. The immunisation form adds a "historis" checkbox and a reason select.

**Edge cases** — Twins: two registrations, birth order 1 and 2, same date of birth. A mother who is herself a newborn record is refused. A single birth sends `multipleBirthInteger: 1`; the page says a single birth "can use 0", so the spike confirms that 1 is accepted. POST is not retried by the HTTP client, but SATUSEHAT's duplicate check on NIK ibu + birth date + birth order returns the existing IHS number, which makes a retried POST safe.

---

### 7.4 E4 — Patient KYC at the front desk

**Outcome** — The front desk verifies a patient's SATUSEHAT Mobile profile from inside the EMR, so the patient can see the records the clinic reports.

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-KYC-01 | MUST | A KYC client implementing SATUSEHAT's hybrid encryption. The deployment holds an RSA key pair. Each request is AES-256-GCM encrypted, the AES key is wrapped with SATUSEHAT's RSA public key (OAEP, SHA-256), and the body is sent as `text/plain` armoured `-----BEGIN ENCRYPTED MESSAGE-----`. Responses are decrypted with the private key |
| FR-KYC-02 | MUST | `POST /kyc/v1/generate-url` with `agent_name` and `agent_nik` of the signed-in operator. The returned validation URL opens in a dialog frame, with a new-tab fallback if the frame is refused. There the operator enters the patient's SATUSEHAT Mobile access code, checks NIK, name and photo, and submits |
| FR-KYC-03 | MUST | The operator's NIK is stored encrypted with a blind index, using the patient-identifier pattern (`docs/post-mvp/patient-identifiers.md`), on the staff profile from P20-T04. An operator without a NIK sees "Tambahkan NIK Anda di profil untuk memverifikasi pasien" instead of the button |
| FR-KYC-04 | MUST | New key `satusehat-kyc.verify:any` for `ADMIN` and `MIDWIFE`. In a klinik bidan the bidan is often also the desk |
| FR-KYC-05 | MUST | Audit `SATUSEHAT_KYC_STARTED` with the operator user id and, when launched from a patient page, the patient id. Never the token, the URL or any NIK |
| FR-KYC-06 | MUST | The validation token and URL are neither persisted nor logged. `lastError`-style fields store the error code only |
| FR-KYC-07 | MUST | KYC is disabled with an explanation when SATUSEHAT is unconfigured, or when the environment is sandbox and the spike finds no KYC sandbox. Production depends on P21-T06 |
| FR-KYC-08 | COULD | The challenge-code method (`POST /kyc/v1/challenge-code`, per NIK). The access-code flow in FR-KYC-02 is the one the operational guide documents for the desk |

**User stories**

- **US-KYC-01** — As a front desk officer, I want to verify a patient's SATUSEHAT Mobile profile, so that she can see her resume medis.
  - *Given* an operator with a NIK on file and the patient's app access code, *when* the operator clicks "Verifikasi SATUSEHAT" on the patient page, *then* the validation page opens in a dialog, and closing it returns to the patient page.
  - *Then* the audit has one `SATUSEHAT_KYC_STARTED` row with operator and patient ids and no NIK.
- **US-KYC-02** — As a clinic admin, I want KYC to fail loudly when it cannot work.
  - *Given* the deployment runs on the sandbox without KYC, *when* anyone opens a patient page, *then* the KYC button is disabled with the reason.

**Data model delta** — the operator NIK (ciphertext, index, last4, key version) on the P20-T04 staff profile. No KYC table: a session is audited, not stored.

**API surface** — `POST /api/v1/satusehat/kyc/sessions` (`satusehat-kyc.verify:any`), body `{ patientId? }`, response `{ data: { url, expiresAt? } }`. The URL is returned once and never logged.

**RBAC** — `verify` is already in `SUPPORTED_ACTIONS`. The ADMIN preset must add the resource.

**Config** — `SATUSEHAT_KYC_PRIVATE_KEY` and `SATUSEHAT_KYC_PUBLIC_KEY` (PEM, from the secret store; see `docs/security/secrets.md`) and `SATUSEHAT_KYC_SERVER_PUBLIC_KEY`. A missing key disables KYC; it does not crash the API.

**Edge cases** — SATUSEHAT may refuse framing. The dialog detects a blocked frame and offers the new-tab link. The URL is short-lived, so the dialog never caches it.

---

### 7.5 E5 — Inpatient reporting refinements

**Outcome** — Every stay, including a direct admission for labour, reaches SATUSEHAT with the beds the patient occupied and how she left.

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-IP-01 | MUST | An IMP Encounter's `location[]` is built from the admission's `BedAssignment` rows in order. Each entry references the bed's Location with `period.start`/`end` and carries the `serviceClass` extension: the value comes from the room's class (`locationServiceClass-Inpatient`), and `upgradeClassIndicator` is `kelas-tetap` (see Q7). An unregistered bed falls back to the root, with the monitor warning from FR-LOC-09 |
| FR-IP-02 | MUST | The discharge form requires a disposition: `HOME` → `home`, `AGAINST_ADVICE` → `aadvice`, `REFERRED` → `other-hcf`, `DIED` → `exp-lt48h` or `exp-gt48h` (computed from `admittedAt`, kemkes system), `OTHER` → `oth` plus free text. Legacy rows without one keep D-030's `home` |
| FR-IP-03 | MUST | A direct admission (no `sourceEncounterId`) opens an admission encounter for the admitting clinician in the same transaction, and links it as the source. The stay then has a chart for diagnoses, vitals, immunisations and prescriptions, and a reportable Encounter. The spike confirms the registration shape |
| FR-IP-04 | COULD | `naik-kelas` / `turun-kelas` when a transfer changes class. Needs the patient's entitled class, which the record does not hold |

**User stories**

- **US-IP-01** — As SATUSEHAT, I receive where the patient slept.
  - *Given* an admission in Bed 1 (Kelas 2) from 10 Sep 08:00, transferred to Bed 4 (VIP) at 11 Sep 14:00, and discharged on 12 Sep 09:00, *when* it is discharged, *then* `Encounter.location` has two entries with those periods and service classes `2` and `vip`.
- **US-IP-02** — As a bidan, I want a mother admitted in labour to be reported even though she never queued for a consultation.
  - *Given* a direct admission, *when* it is created, *then* an encounter exists for the admitting midwife with the admission as its stay, and discharging it enqueues exactly one `ENCOUNTER` row.
- **US-IP-03** — As a bidan, I record that a patient left against advice.
  - *Given* "Pulang atas permintaan sendiri", *when* the bidan discharges, *then* `hospitalization.dischargeDisposition.coding[0].code` is `aadvice`.

**Data model delta** — enum `DischargeDisposition`; `admissions.discharge_disposition` (null for legacy rows) and `admissions.discharge_disposition_note`.

**API surface** — `POST /api/v1/admissions/:id/discharge` requires `dischargeDisposition` (plus `dischargeDispositionNote` when `OTHER`). `POST /api/v1/admissions` without `sourceEncounterId` returns the created encounter id.

**RBAC** — unchanged (`admission.admit/discharge:any` already granted to `DOCTOR`, and copied to `MIDWIFE` by E1).

**Edge cases** — A backfilled admission whose bed history predates the Location registration uses the root for those entries. A cancelled admission still leaves its auto-created encounter to be closed or cancelled by staff; it is never reported as IMP (D-030).

---

## 8. Non-Functional Requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Privacy | NIK values (operator, mother, newborn) are only ever stored as ciphertext + blind index + last4, per `docs/post-mvp/patient-identifiers.md`. No NIK appears in logs, `lastError`, audit metadata or error messages |
| NFR-02 | Secrets | KYC key material lives in the secret store (`docs/security/secrets.md`), never in the repository. The repo is public |
| NFR-03 | Audit | Every SATUSEHAT Patient create/link and Location register/update is audited with the actor (a user or `SUBMISSION_WORKER`). KYC starts are audited per FR-KYC-05 |
| NFR-04 | Retention | Newborn records follow the RME retention floor (`RME_RETENTION_YEARS` ≥ 25) and soft delete, like every patient record |
| NFR-05 | Resilience | Location registration runs sequentially with the existing circuit breaker. A breaker-open state stops the batch and reports how many rows were done |
| NFR-06 | Observability | The submission monitor shows new failure codes (`MOTHER_NIK_MISSING`, `MOTHER_NOT_FOUND`, `FALLBACK_LOCATION`) as codes, never with clinical content (the P10-T04 promise) |
| NFR-07 | i18n | All new copy in `id` and `en`. Indonesian is primary for this segment |
| NFR-08 | Accessibility | The KYC dialog traps focus, returns focus to its trigger, and closes on Escape |

---

## 9. Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| KYC has no sandbox (a third-party README says so; the official doc shows staging URLs) | Medium | High — E4 unverifiable before production | P24-T01 probes staging. If there is none, E4 ships behind FR-KYC-07 and is verified on the first production clinic after P21-T06 | Engineering |
| `serviceClass` required on a poli Location (the Location page marks it mandatory; the IG says 0..1) | Medium | Medium — poli registration rejected | P24-T01 posts a poli without it. If it is rejected, send the clinic's lowest class as documented in the answer | Engineering |
| P20 / P21 / P22 edit the same doctor schema, form and `seed.sql` | High | Medium — merge conflicts | Land E1 after P20-T01 and P21-T08. Regenerate `openapi.yaml`; never hand-merge it | Engineering |
| D-033 ships before E1 saying "only doctors" | Medium | High — locks midwives out | FR-MW-08 is a change request on P22-T01 now, not later | Product |
| Auto-created admission encounter conflicts with registration/queue invariants | Medium | Medium | P24-T01 reads the registration flow first; FR-IP-03 may create a registration with a dedicated source | Engineering |
| Permenkes 28/2017 superseded by PP 28/2024 for midwife authority | Low | Low — FR-MW-06 is clinic-configured anyway | Q4 | Product |

---

## 10. Rollout Plan

- **Entitlements.** E1 is core (no entitlement). E2, E3's SATUSEHAT part and E4 sit under `satusehat`. E5 sits under `room-management`.
- **Migrations.** All are additive and nullable except `doctor_profiles.profession` (`NOT NULL DEFAULT 'DOCTOR'`). Hand-stamped future dates per the repo's migration convention. Run `migrate deploy`, then re-run `pnpm db:seed` for the `MIDWIFE` role and the new keys.
- **Backfill.** None is required. Location ids start empty, so everything falls back to the root until the clinic registers.
- **Order.** E1 → E2 → E3/E5 → E4. E2 precedes E5 because bed locations need registered beds. E4 goes last because it needs P21-T06 and P20-T04.
- **Rollback.** Each epic is behind its own code path. Reverting the mapper change restores today's single-location bundle; the new columns are ignored.

---

## 11. Sprint Backlog

| Sprint | Story | Points | Depends on | DoD |
| --- | --- | --- | --- | --- |
| 28 | P24-T01 SPIKE — sandbox probes: Location POST (poli without serviceClass, identifier search), newborn POST + `nik-ibu` search, `multipleBirthInteger: 1`, KYC staging + encryption handshake, midwife Practitioner lookup, Immunization with the full mandatory set, registration shape for FR-IP-03 | 3 | — | Written findings in `docs/ops/`; decisions appended to this PRD |
| 28 | P24-T02 D-034 + `ClinicianProfession` + `MIDWIFE` role seed + `CLINICIAN_ROLE_CODES` refactor (FR-MW-01/02/04/08) | 5 | — | CI gate: lint, typecheck, unit, integration, build, prisma validate; seed re-run |
| 28 | P24-T03 Midwife onboarding and portal: create/edit with profession, invitation role, profession lock, `proxy.ts`, shell label, "Tenaga klinis" list (FR-MW-03/05/07/09) | 5 | T02 | CI gate + browser check of the midwife login |
| 28 | P24-T04 Midwife prescribing boundary (FR-MW-06) | 3 | T02 | CI gate |
| 28 | P24-T05 Location master data: coordinates, root site, `satusehat_location_id` columns, service-class mapping (FR-LOC-01/02/05) | 5 | T01 | CI gate + migration drift check |
| 28 | P24-T06 Location registration service + admin panel (FR-LOC-03/04/06/07/08) | 8 | T05 | CI gate + live sandbox registration of a demo tree |
| 29 | P24-T07 Outpatient Encounter uses the poli Location (FR-LOC-09) | 2 | T06 | CI gate |
| 29 | P24-T08 Inpatient `location[]` history + discharge disposition (FR-IP-01/02) | 5 | T06 | CI gate + sandbox submission |
| 29 | P24-T09 Direct admission reporting (FR-IP-03) | 5 | T01 | CI gate + integration spec |
| 29 | P24-T10 Newborn registration: mother link, birth order, UI (FR-NB-01/02) | 5 | — | CI gate |
| 29 | P24-T11 Newborn SATUSEHAT identity (FR-NB-03/04) | 5 | T01, T10 | CI gate + live sandbox create |
| 29 | P24-T12 Immunization completeness (FR-IM-01..04) | 5 | P21-T02, T07 | CI gate + sandbox submission |
| 30 | P24-T13 Newborn first-NIK PATCH (FR-NB-05) | 3 | T11, P21-T09 | CI gate |
| 30 | P24-T14 KYC encryption client + config (FR-KYC-01) | 5 | T01 | Unit tests against the documented example |
| 30 | P24-T15 Operator NIK on the staff profile (FR-KYC-03) | 3 | P20-T04 | CI gate |
| 30 | P24-T16 KYC session route + dialog + audit + permission (FR-KYC-02/04–07) | 5 | T14, T15, P21-T06 | CI gate + first production verification |
| 30 | P24-T17 Challenge-code method (FR-KYC-08) | 3 | T16 | Optional; drop if Sprint 30 runs over |

Sprint 28 = 29 points, Sprint 29 = 27, Sprint 30 = 19 (16 without T17). Sprint 30 is light on purpose: E4 cannot be verified before production access, and that date is not ours.

**Not in this backlog:** ANC/KIA records, a nurse role, bed-status sync, sub-organisations, class upgrade indicators (FR-IP-04), and delegated-authority enforcement.

**Superseded ticket:** P21-T07 (SJ-185, KYC, 5 points) becomes T14 + T15 + T16. Close it as superseded when P24 is filed.

---

## 12. Open Questions

| # | Question | Owner | Needed by | Blocking? |
| --- | --- | --- | --- | --- |
| Q1 | Does SATUSEHAT accept a poli Location without `serviceClass`? | Engineering (P24-T01) | 2026-09-18 | Blocks P24-T06 |
| Q2 | Rawat gabung: does the baby get her own admission and bed, or does she ride on the mother's stay? The partial unique index allows one open assignment per bed | Product + pilot bidan | 2026-09-18 | Blocks newborn stays in P24-T08 |
| Q3 | Should the EMR enforce delegated authority (Permenkes 28/2017 Pasal 22–25: program immunisation beyond HB0, IUD/implant, MTBS), or leave it to the clinic? | Product + clinic compliance | 2026-09-25 | No |
| Q4 | Has PP 28/2024 or a newer Permenkes replaced Permenkes 28/2017 on midwife authority? | Product (legal check) | 2026-09-25 | No |
| Q5 | Who runs KYC at a klinik bidan, and does P20-T04's staff profile land before Sprint 30? If not, where does the operator NIK live in the meantime? | Product | 2026-09-22 | Blocks P24-T15 |
| Q6 | Is there a KYC sandbox? | Engineering (P24-T01) | 2026-09-18 | Blocks P24-T16 verification |
| Q7 | Do we ever know a patient's entitled room class (BPJS), so that `naik-kelas` / `turun-kelas` can be sent? | Product | 2026-10-01 | No |
| Q8 | Keep the `/doctor` URL for midwives, or add a `/bidan` alias later? | Product | 2026-09-25 | No |

---

## 13. Appendix

### 13.1 Code mappings

| Our value | SATUSEHAT element | System | Code |
| --- | --- | --- | --- |
| Root site | `Location.physicalType` | `http://terminology.hl7.org/CodeSystem/location-physical-type` | `si` |
| Poli (`Specialty`) | `Location.physicalType` | same | `ro` |
| `Ward` | `Location.physicalType` | same | `wa` |
| `Room` | `Location.physicalType` | same | `ro` |
| `Bed` | `Location.physicalType` | same | `bd` |
| `RoomClass` → `CLASS_1/2/3/VIP/VVIP` | `Encounter.location.extension:serviceClass.value` | `http://terminology.kemkes.go.id/CodeSystem/locationServiceClass-Inpatient` | `1`, `2`, `3`, `vip`, `vvip` |
| Same class, no transfer | `…serviceClass.upgradeClassIndicator` | `http://terminology.kemkes.go.id/CodeSystem/locationUpgradeClass` | `kelas-tetap` |
| `HOME` / `AGAINST_ADVICE` / `REFERRED` / `OTHER` | `hospitalization.dischargeDisposition` | `http://terminology.hl7.org/CodeSystem/discharge-disposition` | `home` / `aadvice` / `other-hcf` / `oth` |
| `DIED` | same | `http://terminology.kemkes.go.id/CodeSystem/discharge-disposition` | `exp-lt48h` / `exp-gt48h` |
| Administering performer | `Immunization.performer.function` | `http://terminology.hl7.org/CodeSystem/v2-0443` | `AP` |
| `ImmunizationReason` | `Immunization.reasonCode` | `http://terminology.kemkes.go.id/CodeSystem/immunization-reason` | `IM-Dasar`, `IM-Baduta`, `IM-SD`, `IM-WUS`, `IM-Tambahan`, `IM-Khusus`, `IM-Pilihan` |
| Mother's NIK | `Patient.identifier` | `https://fhir.kemkes.go.id/id/nik-ibu` | the NIK |

### 13.2 Sources and verification status

| Fact | Source | Status |
| --- | --- | --- |
| Location: position and serviceClass marked mandatory; identifier system; `partOf`; the example swaps lat/long | satusehat.kemkes.go.id/platform/docs/id/fhir/resources/location/ | VERIFIED |
| `LocationServiceClass` is 0..1 in the IG | simplifier.net/id-fhir/locationserviceclass | VERIFIED |
| Rawat inap: IMP, `location[]` with periods on transfer, serviceClass extension, discharge codes | satusehat.kemkes.go.id/platform/docs/id/interoperability/rawat-inap-new/ | VERIFIED |
| Sub-extension name `upgradeClassIndicator` vs `upgradeClass` | same page (narrative and example disagree) | UNVERIFIED |
| Newborn Patient via `nik-ibu`, duplicate check, PATCH to add NIK | satusehat.kemkes.go.id/platform/docs/id/master-data/master-patient-index/pasien-bayi/ | VERIFIED |
| `multipleBirthInteger` for a single birth | same page ("can use 0") | UNVERIFIED |
| KYC generate-url, hybrid encryption, challenge-code, operator access-code flow | satusehat.kemkes.go.id/platform/docs/id/kyc/kyc-doc/ | VERIFIED |
| KYC sandbox availability | official doc shows staging URLs; a third-party README says there is none | UNVERIFIED |
| Midwife resolves through the same Practitioner NIK lookup | satusehat.kemkes.go.id/platform/docs/id/api-catalogue/onboardings/apis/practitioner/ | VERIFIED |
| How a midwife's profession shows in the Practitioner response | — | UNVERIFIED |
| Immunization mandatory set, reason codes, `performer.function` | satusehat.kemkes.go.id/platform/docs/id/interoperability/imunisasi-new/ | VERIFIED |
| Routine-timing code list (e.g. a "kejar" code) | same guide, list incomplete | UNVERIFIED |
| Midwife own authority (Pasal 19–21) and delegated authority (Pasal 22–25) | Permenkes 28/2017, official PDF | VERIFIED |
| UU 4/2019 Kebidanan repealed by UU 17/2023; implementing rules survive where compatible | UU 17/2023 Pasal 454 | VERIFIED (secondary) |
