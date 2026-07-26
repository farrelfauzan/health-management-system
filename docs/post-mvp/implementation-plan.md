# HMS Implementation Plan (Post-MVP)

Continuation of [docs/MVP/implementation-plan.md](../MVP/implementation-plan.md). MVP phases end at Phase 5 (hardening); this plan starts at Phase 7. Same delivery principles apply: one branch per task (`feature/p<phase>-t<task>-<short-desc>`), strict `repository -> service -> controller` layering, mandatory quality gates before merge.

## 1. Why This Order (Market and Regulatory Context)

Research summary (July 2026), full context in session research:

- PMK No. 24/2022 legally mandates electronic medical records (RME) and SATUSEHAT integration for **all** facilities including clinics and solo practices; the compliance deadline (Pasal 45) was 31 December 2023, so the mandate is already past due for every prospective customer.
- Incumbent vendors bundle compliance at their cheapest tiers: Trustmedis includes RME + SATUSEHAT + BPJS PCare at Rp99k/month; Klinik Pintar bundles billing, inventory, queue management, and BPJS at Rp300k/month and offers a free solo-doctor tier.
- The market is fragmented (a major EMR vendor reached only ~8.9% of eligible FKTPs after 33 months) and purchases are driven by regulatory deadlines, not organic demand.

Conclusion: compliance features (coded EMR, SATUSEHAT, BPJS) and front-desk basics (queue, billing) are the purchase triggers for Indonesian small clinics. They are ordered first below. The AGENTS.md MVP scope note ("do not expand scope until MVP modules are stable") is superseded by this plan once Phase 5 (MVP hardening) is complete.

## 2. Phase 7 - Clinical Data Model Enrichment (Backend, 7 Tasks)

Goal: extend `PatientProfile`, `DoctorProfile`, and `Medication` with the identity and credential fields required by PMK 24/2022, SATUSEHAT, and BPJS — **before** more production data accumulates. All fields go through `packages/shared-types` schemas per repo convention.

Identifier storage and MRN allocation are specified in [patient-identifiers.md](./patient-identifiers.md) — read it before starting `P7-T01`.

### 2.1 Patient fields (`P7-T01`, `P7-T02`)

1. `P7-T01` Migration + schema: national identity and payer fields. Land these columns **already encrypted** (`P7-T07`) so no plaintext window exists.
   - `nik` (16 digits, nullable — newborns/foreigners may lack one). Stored as `nikCiphertext` + `nikIndex` (unique) + `nikLast4`; validate structure, not a checksum — NIK has none, but digits 7–12 encode `DDMMYY` with +40 on `DD` for female, so it cross-checks against `dateOfBirth`/`gender` as a soft warning. SATUSEHAT uses NIK as the master patient index key (`https://fhir.kemkes.go.id/id/nik` identifier system).
   - `bpjsNumber` (13 digits, nullable). Same encrypted + blind-index treatment, unique on the index.
   - `satusehatPatientId` (IHS number, nullable — filled after first successful SATUSEHAT patient lookup/registration). Encrypted, no blind index.
   - `placeOfBirth`. **Do not add `gender`** — `PatientProfile` already has `sex PatientSex?` with the same `MALE | FEMALE` values; keep one field and map it to FHIR `gender` in the SATUSEHAT adapter.
2. `P7-T02` Migration + schema: demographic and clinical-safety fields required by PMK 24/2022 patient identity / expected by clinics.
   - `bloodType` (enum A/B/AB/O + rhesus), `maritalStatus`, `occupation`, `religion` (optional; present on Indonesian registration forms and PCare).
   - `email` (optional), `emergencyContactName`, `emergencyContactPhone`, `guardianName`/`guardianRelation` (penanggung jawab — required for minors).
   - `allergies` as a structured list (free-text substance + reaction severity enum for now; coded later in EMR phase).

### 2.2 Doctor fields (`P7-T03`, `P7-T04`)

3. `P7-T03` Migration + schema: licensing and identity.
   - `nik` (unique, required for SATUSEHAT practitioner lookup).
   - `strNumber` (Surat Tanda Registrasi — SATUSEHAT resolves practitioners against STR data). Note: under UU Kesehatan No. 17/2023 STR is now lifetime, so no expiry field; verify current rule at implementation time.
   - `sipNumber` + `sipExpiresAt` (Surat Izin Praktik — per practice location, time-limited; clinics must track expiry for licensing audits). Model as a `DoctorLicense` child table (type enum `STR | SIP`, number, issuedAt, expiresAt nullable) rather than flat columns, so multi-SIP doctors are representable.
   - `satusehatPractitionerId` (IHS number, nullable).
4. `P7-T04` Migration + schema: profile fields clinics expect on doctor listings.
   - `specialty` (enum or reference table: umum, gigi, spesialis codes), `title`/`degrees` (e.g. `dr., Sp.PD`).
   - `DoctorEducation` child table: institution, degree, fieldOfStudy, graduationYear (SATUSEHAT `Practitioner.qualification` maps from this + licenses).
   - `phoneNumber`, `email` on DoctorProfile (SATUSEHAT Practitioner requires at least one ContactPoint).

### 2.3 Medication fields (`P7-T05`)

5. `P7-T05` Migration + schema: `kfaCode` (Kamus Farmasi dan Alat Kesehatan code, nullable, unique when present — required for SATUSEHAT medication resources), `unit` (tablet/kapsul/ml), `category`. Add the missing medication create/update admin endpoints (catalog is currently read-only via API).

### 2.4 Identifier handling (`P7-T06`, `P7-T07`)

Design: [patient-identifiers.md](./patient-identifiers.md).

6. `P7-T06` MRN auto-generation. `MrnCounter` migration + atomic `UPDATE … RETURNING` allocation inside the patient-create transaction; remove `mrn` from `createPatientSchema` (response-only from here on); admin legacy-import path for clinics migrating existing MRNs, gated by a new `patient.import-identifier` permission; decide MRN uniqueness scope (global vs `@@unique([facilityId, mrn])`) before any production data exists. MRN is immutable — no update path. Regenerate the web client.
7. `P7-T07` Identifier encryption at rest. `PatientIdentifierCryptoService` in `apps/api/src/common/crypto/` (AES-256-GCM for ciphertext, HMAC-SHA256 blind index for lookup/uniqueness — a plain hash is brute-forceable because name/DOB/address sit in plaintext in the same row); shared normaliser used by every write path; `patient.read-identifier` permission with masked-by-default responses and an audit event on every unmask; `PATIENT_PII_ENCRYPTION_KEY` + `PATIENT_PII_INDEX_KEY` (both distinct from `AI_PROVIDER_ENCRYPTION_KEY`); key- and pepper-rotation procedures added to the release runbook.

Phase 7 notes:

- Every new field is optional/nullable at the API layer except where noted, so existing MVP data and flows keep working; enforce required-ness progressively in the EMR/SATUSEHAT phases.
- Update seeders, integration tests, and regenerate the web client (`pnpm api:contract:sync`) per task.
- `P7-T06` and `P7-T07` must land with (or before) `P7-T01` — retrofitting either onto live clinical records means a plaintext window plus renumbering MRNs already printed on physical folders.
- Never put real NIK or BPJS values in seeders or fixtures; use structurally valid synthetic values.

## 3. Phase 8 - Encounter / EMR Module and Queue (Backend, 6 Tasks)

Goal: the legally mandated clinical record. New module `emr` (or `encounter`) following standard layout. PMK 24/2022 minimum outpatient record content: verified patient identity, date/time, anamnesis (complaint + history), physical and supporting examination results, diagnosis, treatment plan, medication/actions given.

1. `P8-T01` Schema: `Encounter` (links registration, patient, doctor; status enum `IN_PROGRESS | FINISHED | CANCELLED`; startedAt/endedAt). One encounter per completed registration.
2. `P8-T02` Schema: `VitalSigns` on encounter — height (cm), weight (kg), systolicBp, diastolicBp, pulseRate, respiratoryRate, temperature, spO2. Store LOINC mapping in the SATUSEHAT adapter, not the DB.
3. `P8-T03` Schema: `Diagnosis` — `icd10Code` + display text, type enum `PRIMARY | SECONDARY`, per encounter. Ship an `Icd10Code` reference table + seed (WHO/Kemenkes list) with a search endpoint.
4. `P8-T04` SOAP note fields on encounter: `subjective` (anamnesis), `objective` (exam findings), `assessment`, `plan`; procedures as ICD-9-CM coded rows (`Procedure` table) — needed later for BPJS claims.
5. `P8-T05` Encounter service/controller: open encounter from a `CHECKED_IN` registration, record vitals/SOAP/diagnoses, close encounter (transition registration to `COMPLETED`); link prescriptions to the encounter.
6. `P8-T06` Queue numbers: per-day, per-poli sequential queue number generated on registration (`queueNumber`, `queueDate` indexed); endpoints for today's queue board. Small task, high demo value — Indonesian clinics operate on antrian.

## 4. Phase 9 - Billing / Kasir Module (Backend, 4 Tasks)

Goal: minimum viable cashier — every incumbent bundles this at the pratama tier.

1. `P9-T01` Schema: `ServiceTariff` (consultation/action price list), `Invoice` + `InvoiceItem` (auto-collect from encounter: consultation fee, procedures, dispensed medications), status enum `DRAFT | ISSUED | PAID | VOID`.
2. `P9-T02` Schema: `Payment` (method enum `CASH | TRANSFER | QRIS | INSURANCE`, amount, paidAt, cashier userId). Partial payments out of scope; one payment per invoice for v1.
3. `P9-T03` Billing service/controller: generate invoice from a finished encounter (transactional), record payment, void with reason + audit.
4. `P9-T04` Daily cashier report endpoint (totals by method, by doctor) — the report clinic owners actually ask for first.

## 5. Phase 10 - SATUSEHAT Integration (Backend, 6 Tasks)

Goal: FHIR R4 submission to Kemenkes. Build as an infrastructure adapter in `src/common/` or a dedicated `satusehat` module; domain services never import FHIR types. Develop entirely against the public sandbox first.

1. `P10-T01` Adapter foundation: OAuth2 client-credentials token client with caching/refresh, typed `ConfigService` config (base URL, org ID, per-environment client id/secret), timeout/retry/circuit-breaker (same policy pattern as the AI chatbot adapter in [ai-chatbot.md](./ai-chatbot.md)).
2. `P10-T02` Master-data lookups: Patient by NIK -> store IHS number on `PatientProfile`; Practitioner by NIK/STR -> store IHS number on `DoctorProfile`.
3. `P10-T03` FHIR mappers: Encounter (registration/encounter lifecycle -> arrived/in-progress/finished), Condition (Diagnosis -> ICD-10), Observation (vitals -> LOINC-coded).
4. `P10-T04` Submission pipeline: outbox table (`SatusehatSubmission` with status/attempts/lastError) + async worker so clinical flows never block on Kemenkes availability; submit encounter bundle on encounter close.
5. `P10-T05` Medication resources: MedicationRequest/MedicationDispense from prescription + dispense records using `kfaCode` (skip items without a KFA code, log a gap report).
6. `P10-T06` Ops surface: submission status endpoint + retry endpoint for admins; integration tests against recorded sandbox fixtures.

## 6. Phase 11 - BPJS PCare Bridging (Backend, Scoping + 4 Tasks)

Goal: serve JKN clinics (the majority of klinik pratama). Highest external-dependency risk — PCare credentials are issued per facility and the API has its own conventions (custom signature headers, non-FHIR payloads). Start with a scoping spike.

1. `P11-T01` Spike: obtain PCare dev credentials, document auth (cons id / secret / user key signature), map required flows: pendaftaran (visit registration), kunjungan (encounter with ICD-10), obat, rujukan (referral). Output: ADR in `docs/post-mvp/decisions.md`.
2. `P11-T02` Adapter + config (per-clinic credentials), eligibility check by BPJS number on registration.
3. `P11-T03` Visit registration + encounter submission to PCare from existing registration/encounter data.
4. `P11-T04` Antrean online (Mobile JKN queue) bridging — evaluate after core PCare flows; queue-number model from `P8-T06` is the prerequisite.

## 7. Phase 12 - Frontend, Localization, and Depth (Parallelizable)

1. `P12-T01` Frontend integration for Phase 7-9 modules (same per-module pattern as MVP Phase 4), building the missing patient/doctor/appointment/registration/pharmacy screens.
2. `P12-T02` i18n with Bahasa Indonesia as the default UI language (`next-intl` or equivalent); all clinic-facing copy in Indonesian, keep English as secondary. Non-negotiable for the target segment.
3. `P12-T03` Pharmacy inventory depth: batch/lot + expiry date per stock receipt, expiry report, reorder-level alert.
4. `P12-T04` UU PDP No. 27/2022 alignment pass: PII field-level audit of logs/responses, data-retention policy (PMK 24/2022: RME retained min. 25 years), consent capture on patient registration.

## 8. Phase 13 - AI Chatbot Integration (Backend + Frontend, 11 Tasks)

Goal: integrate an external production AI service through the HMS backend gateway with strict safety boundaries. **Start only after Phase 10 SATUSEHAT submission pipeline is stable** (`P10-T06` complete) so patient/practitioner IHS linkage and encounter data can enrich chat context safely.

Full specification: [docs/post-mvp/ai-chatbot.md](./ai-chatbot.md).

1. `P13-T01` Schema migration: `AiProviderConfig`, `ChatSession`, `ChatMessage`, enums, indexes.
2. `P13-T02` RBAC seed: chat + `ai-provider.*` permissions + role bindings.
3. `P13-T03` Module skeleton + repositories (provider config CRUD with encrypted keys, session/message ownership filters).
4. `P13-T04` Multi-provider layer: `AiChatProvider` interface, `AiProviderRegistry`, `OpenAiCompatibleAdapter`, `AnthropicAdapter`, resolver + crypto + per-config circuit breaker.
5. `P13-T05` Admin provider API (CRUD, activate, test connection) + `AiChatbotService` orchestration.
6. `P13-T06` Context enrichment via domain services (post-SATUSEHAT read models — read-only, redacted).
7. `P13-T07` Safety policy service (input/output guards, disclaimer injection, safety tags).
8. `P13-T08` Chat controller + OpenAPI + integration tests (multi-adapter mocks).
9. `P13-T09` Frontend chat UI + admin provider settings page + Orval sync.
10. `P13-T10` UI tests, Indonesian i18n strings, feature-flag wiring, provider-not-configured states.
11. `P13-T11` Readiness review: safety checklist, UU PDP log audit, rate-limit load test, staging-only enablement.

Rationale: incumbents already ship clinical AI (e.g. Assist.id voice-to-EMR/ICD suggestion), so the chatbot is UX polish — not the market wedge. Compliance and EMR depth come first.

## 9. Sequencing Rules

- Phase 7 must land before Phases 8-11 (they all consume the new fields). Phases 8 and 9 can proceed in parallel after Phase 7. Phase 10 requires Phase 8. Phase 11 requires Phases 7-8; its spike (`P11-T01`) can start anytime. Phase 13 requires Phase 10 (`P10-T06`); Phases 11-12 may proceed in parallel with Phase 13 backend tasks but context enrichment (`P13-T06`) must not ship to production until SATUSEHAT master-data linkage is verified.
- Definition of Done, branching, and quality gates: identical to MVP plan sections 8-9.

## 10. Sources

- PMK No. 24/2022 (official text, Pasal 45 deadline): https://peraturan.bpk.go.id/Details/245544/permenkes-no-24-tahun-2022 and https://keslan.kemkes.go.id/unduhan/fileunduhan_1662611251_882318.pdf
- SATUSEHAT Patient resource / NIK master patient index: https://satusehat.kemkes.go.id/platform/docs/id/fhir/resources/patient/ and https://satusehat.kemkes.go.id/platform/docs/id/master-data/master-patient-index/pasien-nik/
- SATUSEHAT Practitioner (STR-based registration): https://satusehat.kemkes.go.id/platform/docs/id/fhir/resources/practitioner/
- Competitor pricing (verified July 2026): https://trustmedis.com/harga/ , https://klinikpintar.id/aplikasiklinik/form-daftar/pilih-paket , https://assist.id/harga
- FKTP adoption fragmentation study: https://arxiv.org/abs/2512.05381
