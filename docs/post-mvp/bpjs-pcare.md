# BPJS PCare Bridging — Design Note

Design input for Phase 11 of [implementation-plan.md](./implementation-plan.md). Read before starting `P11-T01`.

PCare (Primary Care) is BPJS Kesehatan's application for FKTP (primary-care facilities). Bridging replaces the receptionist's second browser tab: eligibility checks, visit registration, encounter/diagnosis submission, and referrals happen inside HMS instead of the PCare web app.

Scope: PCare only. VClaim (hospital/FKRTL claims) and Aplicare are out of scope.

## 1. External Dependencies and Prerequisites

- The clinic must be a **BPJS-partnered FKTP** with an active PKS (cooperation agreement) and an existing PCare account. HMS cannot obtain credentials as a vendor; access is granted per facility.
- The clinic (or HMS on its behalf, with a letter) requests bridging from its **BPJS Kesehatan branch office (kantor cabang)**. BPJS issues the credentials to the facility.
- API catalog / documentation portal ("Trust Mark"): `https://dvlp.bpjs-kesehatan.go.id:8888/trust-mark/portal.html`.
- Production base URL: `https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0`. A separate development environment exists; all work starts there.

Implication for delivery: like SATUSEHAT production access, Phase 11 is blocked on a real pilot clinic. `P11-T01` (spike, dev credentials) can proceed independently.

## 2. Protocol Notes

Verify every item below against the Trust Mark documentation during `P11-T01` — this section records what the spike must confirm, not settled fact.

### 2.1 Credentials (five values, per facility)

| Value | Notes |
| --- | --- |
| `consId` | Consumer ID issued by BPJS. Not secret. |
| `secretKey` | HMAC signing secret. Secret. |
| `userKey` | Additional API key. Secret. |
| `pcareUsername` | The clinic's PCare web-app login. |
| `pcarePassword` | The clinic's PCare web-app password. Secret. |
| `kdProviderPpk` | The clinic's BPJS provider code, used in payloads. Not secret. |

`pcareUsername`/`pcarePassword` are the credentials clinic staff use to log into PCare directly — holding them means HMS can create and delete claims on the clinic's behalf. Treat them as the most sensitive secret in the system.

### 2.2 Request headers

- `X-cons-id`: consumer ID
- `X-timestamp`: seconds since Unix epoch (UTC), as a string
- `X-signature`: `Base64(HMAC-SHA256("{consId}&{timestamp}", secretKey))`, recomputed per request
- `X-Authorization`: `Basic {Base64("{username}:{password}:{kdAplikasi}")}` — `kdAplikasi` is `095` for PCare
- `user_key`: the user key

### 2.3 Response decoding

Since v3.0 responses are **encrypted and compressed**. Decoding order:

1. AES-decrypt the payload with a key derived from `consId + secretKey + timestamp` (the timestamp sent on the request).
2. Decompress with LZ-String (`decompressFromEncodedURIComponent`).
3. Parse JSON.

There is no official Node SDK. Community PHP libraries are the de-facto reference implementation; port the routine to a TypeScript codec utility with unit tests against recorded fixtures. Producing a working decrypt against the dev environment is the primary success criterion of `P11-T01`.

### 2.4 Conventions

- Response envelope: `{ metaData: { code, message }, response }`. Error codes are inconsistent between endpoints — normalise them in the adapter into a typed error union.
- Dates are `dd-MM-yyyy`.
- Code systems are BPJS-specific and differ from SATUSEHAT: medications use **DPHO** (not KFA), diagnoses use BPJS's own ICD-10 list, poli/dokter/kesadaran/tindakan all have BPJS codes.

## 3. Data Model

New Prisma models. All follow repo conventions (UUID PK, `createdAt`/`updatedAt`, indexed FKs, explicit enums).

### 3.1 `BpjsPcareConfig`

One row per facility. `facilityId` is nullable now (single-tenant deployments) so multi-tenancy lands without a second migration.

- `facilityId` (nullable, unique), `environment` (enum `DEVELOPMENT | PRODUCTION`)
- `consId`, `kdProviderPpk`, `pcareUsername` — plaintext
- `secretKeyCiphertext`, `userKeyCiphertext`, `pcarePasswordCiphertext` — AES-256-GCM
- `secretKeyLast4`, `userKeyLast4` — for masked display
- `isActive`, `lastTestedAt`, `lastTestResult`

Encryption reuses the pattern established in `P7-T07` (`apps/api/src/common/crypto/`) with a dedicated `BPJS_CREDENTIAL_ENCRYPTION_KEY`, distinct from `PATIENT_PII_ENCRYPTION_KEY` and `AI_PROVIDER_ENCRYPTION_KEY`. No blind index is needed — credentials are never looked up by value.

### 3.2 Reference tables (synced from BPJS)

`BpjsPoli`, `BpjsDoctor`, `BpjsKesadaran`, `BpjsTindakan`, `BpjsDiagnosa`, `BpjsDpho`, `BpjsSpesialis`, `BpjsSarana` — each with BPJS code, display name, `syncedAt`. Populated by an admin-triggered sync so dropdowns never make live BPJS calls.

> **As implemented (`P11-T03`):** the eight catalogs share an identical shape, so they landed as one enum-keyed `BpjsReferenceItem` table (`catalog` + unique `(catalog, code)`, `groupCode` holding TINDAKAN's kdTkp bucket). Six catalogs are bulk-synced wholesale; DIAGNOSA and DPHO are keyword-only upstream and populate by search-and-cache. The poli mapping landed on `Specialty.bpjsPoliCode` — no standalone poli entity exists. See the implementation-plan entry for the full rationale.

### 3.3 Mapping

- `DoctorProfile.bpjsDoctorCode` (nullable) — set by admin from the synced doctor list.
- Poli mapping — depends on how departments/poli are modelled by Phase 8; either a `bpjsPoliCode` column on the poli entity or a `BpjsPoliMapping` join table.
- `Medication.dphoCode` (nullable) — sits alongside `kfaCode` from `P7-T05`. Two code systems, one medication row.

### 3.4 `BpjsSubmission` (outbox)

Mirrors `SatusehatSubmission` from `P10-T04`: `type` (enum `PENDAFTARAN | KUNJUNGAN | RUJUKAN`), source entity ref, `status` (enum `PENDING | SENT | FAILED`), `attempts`, `lastError`, `bpjsReferenceNo`, timestamps. Indexed on `status` and source entity.

## 4. API Surface Mapped to HMS Modules

| PCare resource | Purpose | HMS source |
| --- | --- | --- |
| `peserta/{noka}`, `peserta/nik/{nik}` | Eligibility: member active? this clinic their FKTP? class, Prolanis flag | Registration check-in |
| `pendaftaran` (POST/DELETE) | Visit registration — poli, date, complaint, vitals | `Registration` + `VitalSigns` (`P8-T02`) |
| `kunjungan` (POST) | Encounter — ICD-10 diagnosis, consciousness, treatment, discharge status | `Encounter` + `Diagnosis` (`P8-T03`) |
| `obat` | Medications given, DPHO-coded | Pharmacy dispense records |
| `rujukan` (subspesialis / sarana / khusus) | Referral to FKRTL | New capability on encounter close |
| `poli`, `dokter`, `kesadaran`, `tindakan`, `diagnosa`, `dpho`, `spesialis`, `sarana` | Reference lookups | Sync into §3.2 tables |

Happy path per JKN visit: eligibility check at check-in → `pendaftaran` with vitals → doctor completes encounter → `kunjungan` with coded diagnosis + medications → optional `rujukan`.

## 5. Architecture

Same shape as the SATUSEHAT adapter (`P10-T01`): a `bpjs-pcare` infrastructure adapter; domain services never see BPJS wire formats or code systems.

- **Signature interceptor** — builds the five headers per request.
- **Codec utility** — encrypt/decrypt + LZ-String, isolated and unit-tested.
- **Timeout / retry / circuit-breaker** — same policy pattern as the AI provider adapter in [ai-chatbot.md](./ai-chatbot.md).
- **Synchronous vs async split** (differs from SATUSEHAT, which is async-only):
  - *Eligibility check is synchronous* — the front desk needs the answer immediately. Cache per patient per day; degrade to a clear "BPJS tidak dapat dihubungi" state rather than blocking registration.
  - *Submissions are async via the outbox* — BPJS downtime must never block a clinical flow.
- Phase 8 pays for itself twice: the same `Diagnosis` (ICD-10) and `VitalSigns` rows feed both the SATUSEHAT FHIR mappers and the PCare payloads. Two mappers, one data model.

## 6. Admin and Operational Surface

### 6.1 Settings → Integrasi BPJS

Credential form per §3.1. Rules:

- Secrets are **write-only**: responses return `hasSecretKey: true` plus last-4, never the value.
- Explicit UI notice that `pcareUsername`/`pcarePassword` are the clinic's real PCare login and what HMS will do with them.
- Every credential create/update/delete emits an audit event.
- Gated by a new `bpjs.config.manage` permission — not a role-name check.
- **Test Connection** button (required): calls a harmless read endpoint (`poli` list) and reports signature validity, credential acceptance, and successful decryption. Without it, misconfiguration surfaces mid-registration with a patient waiting.

### 6.2 Mapping screens

- Sync reference data (one button, shows `syncedAt` per table).
- Map each `DoctorProfile` to a PCare `kdDokter`.
- Map clinic poli to BPJS `kdPoli`.
- Link medications to DPHO codes (search + link, same UX as the KFA linking from `P7-T05`).

Submissions must fail fast and legibly when a mapping is missing ("Dokter belum dipetakan ke kode BPJS"), not fail at BPJS with an opaque code.

### 6.3 Operational features (the product value)

1. **Eligibility card at registration** — name, `AKTIF`/`NON-AKTIF`, class, whether this clinic is the member's registered FKTP, Prolanis flag. Clear red state for inactive members: those visits will not be reimbursed.
2. **Auto-bridging with a status chip** — every registration/encounter shows `Belum dikirim` / `Terkirim` / `Gagal`. No re-entry into the PCare web app. This is the feature clinics buy.
3. **Bridging monitor** — table of submissions with date, patient, type, status, attempts, BPJS error message, and a retry action; filter by failed / not-yet-sent. Build as a **shared Integrations monitor** covering both SATUSEHAT (`P10-T06`) and PCare rather than two separate screens.
4. **Rujukan issuance** — specialty + destination from synced lists, submit, print referral letter.
5. **Monthly reconciliation report** — "kunjungan tercatat vs terkirim vs gagal" for the current period. Run before the claim deadline; unsubmitted visits are unpaid visits.
6. **Antrean online (Mobile JKN)** — later; requires queue numbers from `P8-T06`.

### 6.4 RBAC

New permissions: `bpjs.config.manage`, `bpjs.submission.read`, `bpjs.submission.retry`, `bpjs.eligibility.check`. Seeded to `SUPER_ADMIN`/`ADMIN`; `bpjs.eligibility.check` also to front-desk roles.

## 7. Risks

- **Credential custody.** HMS holds a login that can create and delete BPJS claims. Encryption at rest, write-only APIs, audit on every access and change, and no credential values in logs or error messages.
- **Undocumented protocol drift.** The decrypt derivation and header format come partly from community implementations. Pin fixtures in tests so a BPJS-side change fails loudly in CI rather than silently in production.
- **Per-facility onboarding.** Every new clinic needs its own BPJS branch-office request; this is a sales/onboarding workflow, not a code path. Document it as a runbook.
- **BPJS availability.** Known to be unreliable. The outbox plus the reconciliation report are the mitigation; never let a BPJS timeout block check-in or encounter close.
- **Deletion semantics.** `pendaftaran` supports DELETE. Cancelling a registration in HMS after submission must propagate, or the clinic's BPJS data drifts from HMS.

## 8. Sources

- BPJS Trust Mark API catalog: https://dvlp.bpjs-kesehatan.go.id:8888/trust-mark/portal.html
- PCare REST v3.0 base: https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0/
- Community reference implementations (headers, signature, decrypt): https://github.com/awageeks/laravel-bpjs , https://github.com/morizbebenk/php-bpjs-rest
- Bridging overview from an integrator's perspective: https://adihusada.co.id/pcare-bpjs-kesehatan
