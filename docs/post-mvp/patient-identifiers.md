# Patient Identifiers — MRN Generation and Identifier Encryption

Companion to [implementation-plan.md](./implementation-plan.md) Phase 7. Defines how `mrn` is allocated and how the national/payer identifiers added in `P7-T01` (`nik`, `bpjsNumber`, `satusehatPatientId`) are stored.

**Placement:** Phase 7, alongside `P7-T01`. Both changes must land **before** production patient data accumulates — a retrofit means a plaintext window plus a backfill over live clinical records.

## 1. Identifier Model

Four identifiers answer four different questions. Only the first is an identity anchor; the rest are attributes *about* an identity.

| Field | Question | Nullable | Owner | Storage |
| ----- | -------- | -------- | ----- | ------- |
| `mrn` | Which record in *this facility*? | Never | HMS (generated) | Plaintext |
| `nik` | Which citizen? | Yes | Dukcapil | Encrypted + blind index |
| `bpjsNumber` | Who pays? | Yes | BPJS | Encrypted + blind index |
| `satusehatPatientId` | Which patient nationally? | Yes — set after first lookup | Kemenkes | Encrypted, no index |

`mrn` stays the internal foreign key for every clinical relation (`Appointment`, `Registration`, `Prescription`, encounters). Consequences:

- **`nik` cannot be the primary key.** `P7-T01` already declares it nullable — newborns have no NIK for weeks, foreign nationals carry a passport or KITAS, and an unidentified emergency arrival needs a record immediately.
- **Availability.** Patients can be registered when SATUSEHAT or Dukcapil is unreachable.
- **Data minimisation (UU PDP No. 27/2022).** Because joins use `mrn`, the NIK never propagates into other tables, log lines, URLs, or API responses. This is minimisation achieved structurally rather than by policy.

## 2. MRN Generation

### 2.1 Current state and the change

`createPatientSchema` currently **requires** `mrn` from the client (`z.string().trim().min(3).max(64)`). This is wrong: the client can collide with an existing MRN, and nothing stops a caller from inventing a format. `updatePatientSchema` already omits `mrn` — that part is correct and must stay.

Change: `mrn` becomes **server-generated on create** and is removed from the create request schema. It remains present on every response contract.

This is a breaking API change — regenerate the web client (`pnpm api:contract:sync`) in the same task.

### 2.2 Format

| Option | Example | Trade-off |
| ------ | ------- | --------- |
| **Zero-padded sequence (recommended)** | `00012345` | Short, unambiguous when read aloud or written on a folder; leaks only total patient count |
| Date-prefixed sequence | `2607-00123` | Common in Indonesian clinics, but implies the creation month is meaningful and complicates uniqueness scope |
| Opaque random | `K7QP2M9X` | No volume leak; harder to dictate over the phone, error-prone on paper |

Default to a zero-padded sequence, width configurable (`PATIENT_MRN_WIDTH`, default 8) with an optional facility prefix (`PATIENT_MRN_PREFIX`). Front-desk staff read these aloud and write them on physical folders — brevity and unambiguous characters matter more than information density.

Both settings are validated at startup (width 4–18, prefix uppercase letters/digits/hyphens, max 8 characters) and are baked into every number already allocated, so they must be chosen before the first patient exists. A sequence wider than the padding is never truncated — the number simply grows.

### 2.3 Uniqueness scope

`mrn` is currently globally `@unique`. In Indonesian practice MRN is **per-facility**, and `AiProviderConfig` already assumes a `facilityId` that `PatientProfile` does not have.

Decide now, in Phase 7:

- **Single-facility deployments:** keep `@unique`.
- **Multi-facility:** add `facilityId` to `PatientProfile` and switch to `@@unique([facilityId, mrn])`.

Changing this after production data exists requires renumbering live records that are already printed on physical folders.

**Decision (`P7-T06`): single-facility.** `PatientProfile.mrn` stays globally `@unique` and `MrnCounter` holds exactly one row, keyed by the nil-UUID sentinel `00000000-0000-0000-0000-000000000000`. The counter PK is already a UUID column, so a multi-facility deployment adds rows and switches the patient constraint without a table rewrite — the allocation statement itself does not change.

### 2.4 Atomic allocation

Never compute `MAX(mrn) + 1` in application code — concurrent registrations race, and the WhatsApp self-service flow makes concurrent creates normal rather than rare.

Use a counter table with a single atomic statement:

```sql
UPDATE mrn_counters
   SET next_value = next_value + 1, updated_at = now()
 WHERE facility_id = $1
RETURNING next_value - 1 AS allocated;
```

**`MrnCounter`** (new table):

| Column | Type | Notes |
| ------ | ---- | ----- |
| `facilityId` | UUID | PK (or a single fixed row while single-facility) |
| `nextValue` | bigint | Next value to allocate |
| `updatedAt` | timestamp | |

Rules:

- Allocation runs **inside the same transaction** as the `PatientProfile` insert. Because the counter update is transactional, a rolled-back create rolls the increment back too and the number goes to the next caller — no hole appears. This is safe and was verified against real Postgres: the abandoned number was never committed to a record, so no folder was ever printed with it. (An earlier draft of this document assumed a rolled-back create "burns" a number; that would be true of a Postgres sequence, which is non-transactional, but not of a counter row.)
- **A committed MRN is never reissued and never renumbered.** Gaps that do arise — from a legacy import lifting the counter, or a manual bump — are left alone; a reused MRN silently merges two patients' histories.
- **MRN is immutable.** No update path, no admin edit. Correcting a wrong record is a merge operation, not an MRN edit.
- **Idempotency.** Retried creates (WhatsApp draft submission, webhook redelivery) must pass an idempotency key. If a patient already exists for that key, return it — do not allocate a second MRN.

### 2.5 Legacy import

Clinics migrating from paper or another vendor have existing MRNs printed on folders that cannot change. Provide an admin-only import path that accepts an explicit `mrn`, gated by a dedicated permission (`patient.import-identifier`, scope `any`) and validated for uniqueness. After import, bump `MrnCounter.nextValue` above the highest imported value.

## 3. Identifier Encryption at Rest

### 3.1 The problem with naive encryption

AES-256-GCM with a random IV per row — the scheme [ai-chatbot.md](./ai-chatbot.md) §9.3 uses for provider API keys — is correct for secrets that are only ever *retrieved*. It does not work for identifiers that must also be *found*:

- The same NIK encrypts to different ciphertext every time, so `@unique` cannot be enforced — but `P7-T01` requires `nik` to be unique.
- Equality lookup becomes a full table scan with one decryption per row. SATUSEHAT patient resolution, duplicate detection during registration, and the NIK-collision merge workflow all need lookup by NIK.

So randomised encryption alone would break three required behaviours.

### 3.2 Design: ciphertext for retrieval, blind index for lookup

Store each searchable identifier twice:

| Column | Purpose | Scheme |
| ------ | ------- | ------ |
| `nikCiphertext` | Retrieve the value | AES-256-GCM, random 12-byte IV per row, auth tag verified on decrypt |
| `nikIndex` | Look up / enforce uniqueness | HMAC-SHA256(pepper, normalised value) — deterministic, so it can be `@unique` and indexed |
| `nikLast4` | Masked display without decrypting | Plaintext, last 4 digits only |
| `keyVersion` | Support incremental key rotation | Small int |

Name the columns `*Ciphertext` / `*Index` explicitly, matching the existing `apiKeyCiphertext` / `apiKeyHint` convention, so no one mistakes `nik` for a plain column. The plaintext `nik` exists only as an in-memory field on the domain type, never as a database column.

`nikLast4` is the analogue of `apiKeyHint`: list views render `••••••••••1234` without decrypting a single row.

### 3.3 Why the index must be keyed (HMAC, not a plain hash)

A plain SHA-256 of a NIK is trivially reversible. NIK structure is `PPRRSSDDMMYYXXXX` — province, regency, district, birth date, then a 4-digit sequence. An attacker holding the database also holds `fullName`, `dateOfBirth`, and `address` **in plaintext in the same row**, which fixes every component except the final four digits. That leaves ~10,000 candidates — instant to brute-force.

Therefore:

- Use **HMAC-SHA256 with a secret pepper** (`PATIENT_PII_INDEX_KEY`) held outside the database, not an unkeyed digest.
- The same reasoning applies to `bpjsNumber` (13 structured digits).

### 3.4 Normalisation before hashing (mandatory)

`3201 0112 3456 7890` and `3201011234567890` are the same NIK but produce different HMACs — the unique constraint would then fail to catch a genuine duplicate. Before both encryption and hashing, apply one canonical normaliser: strip all non-digits, then validate length. Normalisation must be a single shared function, used by every write path (admin API, WhatsApp draft promotion, legacy import).

### 3.5 Per-field decision

| Field | Ciphertext | Blind index | Reasoning |
| ----- | ---------- | ----------- | --------- |
| `nik` | Yes | Yes | Specific personal data under UU PDP; reusable for identity fraud outside HMS; needs uniqueness + SATUSEHAT lookup |
| `bpjsNumber` | Yes | Yes | Payer identifier, needs uniqueness; low entropy so keyed index required |
| `satusehatPatientId` | Yes | **No** | See note below |

**Practitioners use the same scheme.** `DoctorProfile.nik` is stored as `nikCiphertext` / `nikIndex` / `nikLast4` / `nikKeyVersion` and masked in responses, for the same reason: a practitioner NIK is the same Dukcapil citizen identifier as a patient's and carries identical UU PDP obligations. What is *not* encrypted is `DoctorLicense.licenseNumber` (STR/SIP) — those are professional registry numbers, published by KKI/IDI and verifiable by the public, so they carry no comparable sensitivity. `satusehatPractitionerId` stays plaintext for the reasons in the note below, which apply to it with more force than to the patient IHS number: it is read on every outbound FHIR call and never searched by value.

**Note on `satusehatPatientId`:** encrypting it was requested and is implemented here, but it is worth knowing the trade-off. The IHS number is already a *pseudonymous* identifier issued by Kemenkes precisely so NIK does not have to be passed around; it is not usable outside SATUSEHAT. It is also read on every outbound FHIR submission, so encryption adds a decrypt on each call. It needs no blind index because it is always reached via the internal patient id, never searched. If the decrypt overhead shows up in SATUSEHAT submission latency during Phase 10, storing it in plaintext is a defensible reversal — the sensitivity argument that justifies encrypting NIK does not apply to it with the same force.

### 3.6 Key management

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `PATIENT_PII_ENCRYPTION_KEY` | Yes | 32-byte secret for AES-256-GCM on identifier ciphertext |
| `PATIENT_PII_INDEX_KEY` | Yes | 32-byte HMAC pepper for blind indexes |

Both must be **distinct from `AI_PROVIDER_ENCRYPTION_KEY`**: different purpose, different rotation cadence, and separate blast radius if one leaks.

Rotation is asymmetric, and this drives operational planning:

- **Ciphertext key rotation** is incremental and resumable. Decrypt with the old key, re-encrypt with the new, bump `keyVersion` per row. Safe to run in batches against a live database.
- **Pepper rotation is expensive.** Recomputing an HMAC requires the plaintext, so every row must be decrypted first, and the unique constraint must hold throughout. Add the new index column, dual-write both, backfill, swap the constraint, then drop the old column. **Choose the pepper once and rotate it only on compromise.**

Document both procedures in the ops runbook. Never log a decrypted identifier, a key, or a pepper.

### 3.7 Where the crypto lives

Add `NationalIdentifierCryptoService` under `apps/api/src/common/crypto/`, with adapter-only wire types in `national-identifier-crypto.types.ts` per the `common/*.types.ts` convention (this is framework infrastructure that must not leak into `@hms/shared-types`). It serves every domain that stores a national identifier — patient and practitioner alike. The environment variables keep their `PATIENT_PII_` prefix for continuity with existing deployments.

Encrypt and decrypt in the **repository layer**, consistent with the rule that only repositories touch Prisma. Two guardrails, because the failure mode is a developer forgetting:

- Never expose the `*Ciphertext` / `*Index` columns in any DTO or contract — the domain type carries plaintext `nik?: string`, the persistence row never does.
- Use explicit `select` in every query so a new field cannot leak by default.

A Prisma client extension (`$extends`) that encrypts and decrypts transparently is the fail-closed alternative and is harder to bypass, at the cost of more implicit behaviour. Either is acceptable; pick one and apply it consistently.

For SATUSEHAT resolution, decrypt the NIK in memory for the duration of the outbound call only — the same rule `ai-chatbot.md` §9.3 applies to provider keys.

### 3.8 Access control and audit

Decryption is a privileged operation, not a side effect of reading a patient.

- New permission **`patient.read-identifier`** (scope `own` / `any`). Default: patients may see their own identifiers; `ADMIN` and `SUPER_ADMIN` get `any`. `DOCTOR` and `PHARMACIST` do **not** need it — clinical work uses `mrn`.
- Practitioners get a **separate** permission, **`doctor.read-identifier`** (scope `own` / `any`), rather than reusing the patient one. The storage scheme is identical, but the grants are not the same decision: an admin who may verify a patient's KTP is not automatically entitled to staff NIKs, and a doctor holding `doctor.read-identifier:own` can read back their own NIK without gaining any patient disclosure. `ADMIN` and `SUPER_ADMIN` get `any`; `DOCTOR` gets `own`.
- Responses return masked values (`nikLast4`) by default. Full values require the permission and an explicit request — a dedicated route (`GET /patients/{id}/identifiers`, `GET /doctors/{id}/identifiers`), never a flag on the ordinary read.
- The `own` scope means the record's `ownerUserId` and nothing else. It is deliberately **not** widened by an active doctor–patient assignment the way `patient.read` is: a treating doctor works from the MRN.
- Every unmask emits an audit event (`PATIENT_IDENTIFIER_UNMASKED` / `DOCTOR_IDENTIFIER_UNMASKED`) via the existing `common/audit` infrastructure, recording the actor, the scope used, and which fields were revealed — never the values. This aligns with the UU PDP field-level audit work in `P12-T05`.

### 3.9 Accepted limitations

- **No partial search on encrypted identifiers.** Staff cannot search "patients whose NIK starts with 32". `listPatientsQuerySchema.search` must never attempt to match encrypted columns; exact NIK/BPJS lookup is a separate parameter that normalises, hashes, then queries the index.
- **No range or sort queries** on these fields.
- **A lost `PATIENT_PII_ENCRYPTION_KEY` is unrecoverable data loss.** Key custody and backup belong in the release runbook.

## 4. Ingest Validation (plaintext stage)

Validation happens on the normalised plaintext, before encryption.

- `nik`: exactly 16 digits. `P7-T01` says "validate checksum format only" — NIK has no checksum, it has *structure*. Digits 7–12 encode `DDMMYY`, with **40 added to `DD` for female** patients, so a submitted NIK can be cross-checked against `dateOfBirth` and `gender`.
- Treat a mismatch as a **soft warning routed to staff, not a hard reject** — legacy and edge-case NIKs exist and Dukcapil data is not perfectly consistent. This check is most valuable in the WhatsApp registration flow, where no one inspects a physical KTP.
- `bpjsNumber`: exactly 13 digits.
- On a blind-index collision, do not create the patient. Route to the duplicate-merge workflow — a NIK collision is the moment two records are discovered to be the same person.

Any WhatsApp registration draft table storing these identifiers uses the same encryption scheme; identifiers must never sit in a draft as plaintext.

## 5. Delivery Tasks (Phase 7)

Added after the existing `P7-T01`–`P7-T05`.

1. `P7-T06` MRN auto-generation — **delivered**. `MrnCounter` migration, `MrnAllocatorRepository` (`apps/api/src/common/mrn/`) allocating inside the create transaction, `mrn` removed from `createPatientSchema`, `POST /api/v1/patients/import` + `patient.import-identifier` permission, uniqueness scope decided as single-facility (§2.3), web client regenerated.
2. `P7-T07` Identifier encryption — **delivered**. `NationalIdentifierCryptoService` (AES-256-GCM + HMAC blind index), `*Ciphertext` / `*Index` / `*Last4` / `keyVersion` columns, shared normaliser, `patient.read-identifier` and `doctor.read-identifier` permissions, masked-by-default responses with dedicated unmask routes, audit event per disclosure, key- and pepper-rotation procedures in [deployment-runbook.md](../ops/deployment-runbook.md) §5.1–5.2.

`P7-T01` changes accordingly: land the identifier columns **already encrypted**, so no plaintext window ever exists. Also reconcile the duplicate sex/gender field — `PatientProfile` already has `sex PatientSex?` with the same `MALE | FEMALE` values that `P7-T01` proposes to add as `gender`; keep exactly one, and map to FHIR `gender` in the SATUSEHAT adapter if the existing name is retained.

## 6. Testing

| Level | Focus | Where |
| ----- | ----- | ----- |
| Unit | Crypto round-trip; auth-tag tampering rejected; normaliser idempotence; HMAC determinism across equivalent inputs; NIK↔DOB↔gender cross-check; MRN formatting/width/prefix validation | `national-identifier-crypto.service.spec.ts`, `mrn-allocator.repository.spec.ts`, `patient-identifier-validation.spec.ts` |
| Concurrency | 25 parallel allocations produce 25 distinct MRNs; a rolled-back allocation returns its number; an imported MRN lifts the counter | `mrn-allocation.integration.spec.ts` — **real Postgres**, which is why CI runs `integration:test` after `prisma migrate deploy` |
| Integration | Duplicate NIK returns a collision rather than creating; masked-by-default responses; a client-supplied `mrn` is stripped on create; 403 without `patient.read-identifier` / `doctor.read-identifier` / `patient.import-identifier`; legacy import rejects an MRN already in use | `patient-management.integration.spec.ts`, `doctor-management.integration.spec.ts` |
| Service | Audit row written on unmask and free of the identifier value; `OWN` scope not widened by a doctor assignment | `patient-management.service.spec.ts`, `doctor-management.service.spec.ts` |
| Contract | OpenAPI shows `mrn` as response-only; identifier fields masked in examples | `apps/api/openapi.yaml` |

Never place real NIK or BPJS values in fixtures or seed data — use structurally valid synthetic values.

## 7. Related Documents

- [Post-MVP implementation plan](./implementation-plan.md) — Phase 7 sequencing
- [AI chatbot integration](./ai-chatbot.md) — §9.3 API-key encryption (the pattern this extends), §5.3 PII minimisation
- [MVP database schema](../MVP/database.md) — `PatientProfile` baseline
- [MVP RBAC](../MVP/rbac.md) — permission naming and CASL subjects
