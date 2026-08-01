# BPJS Antrean Online — `P14-T02` Spike Preparation

Working document for `P14-T02` in [implementation-plan.md](./implementation-plan.md). Companion to the evaluation in [bpjs-antrean-online.md](./bpjs-antrean-online.md) and to ADR D-024 in [decisions.md](./decisions.md), which records why the spike is staged this way.

**Standing of this document.** Nothing here is a confirmed protocol fact. `P14-T02`'s stated output is an ADR plus recorded fixtures, and both require the pilot clinic's Antrean-service credentials, which BPJS issues per facility through its branch office. Those credentials do not exist yet, so this document holds everything that *can* be prepared without them: what to obtain, what to ask, what each answer unblocks, and what the current hypothesis is — labelled as a hypothesis. Every question in §2 is **UNANSWERED**. The spike closes when they are not.

Writing the ADR now with answers assembled from the reference implementations would produce a document that reads as authoritative and is guesswork. The evaluation already made that point about fixtures — *"Fixtures test our reading of the spec, not the spec"* — and it applies with more force to a protocol whose FKTP flavour mixes freely with the better-documented FKRTL one.

## 1. Credential and access intake

The checklist for the pilot clinic and its BPJS branch office (kantor cabang). None of it is a code path; all of it blocks `P14-T02`.

### 1.1 From the branch office

- [ ] **Antrean-service `consId`, `secretKey`, `userKey`** — issued for the *Antrean* service, not reused from PCare. Confirm in writing that these are distinct from the values already in `BpjsPcareConfig`; a clinic can run PCare bridging without antrean, and losing one credential set must not disable the other.
- [ ] **Base URLs actually issued**, production and development. The evaluation's working assumption is `https://apijkn.bpjs-kesehatan.go.id/antreanfktp` and `https://apijkn-dev.bpjs-kesehatan.go.id/antreanfktp_dev`; confirm rather than assume, and confirm whether a dev environment is issued at all (see Q11).
- [ ] **Inbound credential pair** — the username and password BPJS will present to the facility's token endpoint. Agreed at UAT; treat as a secret with the same handling as the outbound `secretKey`.
- [ ] **BPJS source IP ranges** for the inbound allowlist (Q6).
- [ ] **Facility profile flagged as having a queue system.** Until the branch office sets this, Mobile JKN does not list the clinic at all, and no amount of working code changes that.
- [ ] **Pakta integritas** signed, and the UAT slot scheduled (*Dokumen UAT Bridging Antrol v2.0 FKTP*).

### 1.2 From the clinic

- [ ] **PCare bridging live in production** — the standing prerequisite. Antrean is worth nothing until the visits it queues are also being claimed.
- [ ] **HFIS portal access** (Antrean Faskes / Aplicares), so poli, doctors, shifts, and quota can be read and compared against HMS. HMS never writes HFIS.
- [ ] **Public IP, TLS certificate, and a named owner for uptime.** A deployment behind NAT cannot run this feature. This is an operational commitment on the clinic's side before it is an engineering one.

### 1.3 Where credentials land once issued

Not in this task — `P14-T03` builds `BpjsAntreanConfig`. Recorded here only so the intake does not stall on "where do I put it": a separate row from `BpjsPcareConfig` (separately issued, separately revoked), plaintext `consId`/`kdProviderPpk`, `secretKey`/`userKey` sealed by the existing `BpjsCredentialCryptoService` under `BPJS_CREDENTIAL_ENCRYPTION_KEY`, same partial-unique singleton index. Until then, credentials stay out of the repository entirely — no `.env.example` placeholder that invites someone to paste a real key into a tracked file.

## 2. Question register

Each question carries the current hypothesis and its evidence standing, how it gets answered, and what stays blocked until it is. Status is **UNANSWERED** for all of them; the spike's job is to change that and to record the answer next to the question it replaces.

### Q1 — Does the FKTP flavour use FKRTL's task-ID vocabulary, or only `panggil`?

- **Status:** UNANSWERED. *This is the first question; several others read differently depending on it.*
- **Hypothesis:** FKTP uses the simpler `antrean/panggil` (`status` + `waktu`) pair, and the FKRTL task-ID set (`antrean/updatewaktu` with `taskid` 1–7 plus 99 for no-show, read back via `antrean/getlisttask`) does not apply. Evidence standing: weak — the FKTP material is thinner than FKRTL's and the two mix freely in circulated documents.
- **How it gets answered:** the UAT checklist enumerates the services the facility must demonstrate. Confirm against that document, then against a real `panggil` call.
- **Blocks:** `P14-T05` (how many lifecycle events HMS emits) and, if task IDs *do* apply, a decision that reaches beyond the integration: HMS records no "patient called" event at all — `RegistrationStatus` goes `PENDING → CHECKED_IN → COMPLETED` — so it must either add that event to the registration lifecycle (a real UX change on the doctor's queue screen) or send the encounter-open time as an approximation and accept called-time ≈ served-time on BPJS's dashboard. See [bpjs-antrean-online.md](./bpjs-antrean-online.md) §3.5. Do not decide this before the answer.

### Q2 — What is the exact outbound endpoint set for FKTP?

- **Status:** UNANSWERED.
- **Hypothesis:** `POST antrean/add`, `POST antrean/panggil`, `POST antrean/batal`, `GET ref/poli`, `GET ref/dokter`. Evidence standing: moderate — consistent across the reference implementations, but those lean FKRTL.
- **How it gets answered:** the issued service catalogue plus the UAT checklist; confirm each with one live call.
- **Blocks:** `P14-T03` (outbound adapter surface) and `P14-T05` (which outbox types exist).

### Q3 — Do HFIS `ref/poli` / `ref/dokter` codes match the synced PCare catalog?

- **Status:** UNANSWERED.
- **Hypothesis:** none — the evaluation is explicit that they may or may not agree, and says *"do not assume they agree."*
- **How it gets answered:** call `ref/poli` and `ref/dokter` with the issued credentials and diff the values against the synced PCare `POLI` / `DOKTER` catalogs (`P11-T03`) for the same facility.
- **Blocks:** `P14-T03`. If they agree, `Specialty.bpjsPoliCode` and `DoctorProfile.bpjsDoctorCode` are reused unchanged. If they diverge, both need an HFIS-scoped sibling column, and every mapping screen gains a second field — a schema decision that must not be guessed at.

### Q4 — What is the inbound token scheme?

- **Status:** UNANSWERED. *Security-critical; `P14-T04` is to be reviewed as such.*
- **Hypothesis:** BPJS posts the agreed username/password to a facility-hosted token endpoint and carries the returned token on subsequent calls. Evidence standing: the shape is consistent across sources; **every detail is open** — endpoint path, credential encoding, token format and lifetime, which header carries it, and what BPJS does when it expires mid-session.
- **How it gets answered:** UAT documentation, then confirmed by BPJS actually calling the facility during UAT.
- **Blocks:** `P14-T04` entirely. This is the guard on a public write surface; a guessed scheme is worse than no code.

### Q5 — What are the exact inbound service contracts?

- **Status:** UNANSWERED.
- **Hypothesis:** six services — *get token*, *status antrean*, *ambil antrean*, *sisa antrean*, *pasien baru*, *batal antrean* — answering in BPJS's own `{ metaData: { code, message }, response }` envelope rather than the HMS `{ data }` one. Field names are entirely unconfirmed.
- **How it gets answered:** the UAT document is the contract; it is the facility's to publish and BPJS's to verify.
- **Blocks:** `P14-T04`. Note that two of the six (`ambil antrean`, `pasien baru`) are writes into bookings and patient master data reachable from the public internet.

### Q6 — Which source IPs will BPJS call from?

- **Status:** UNANSWERED.
- **How it gets answered:** branch office, as part of the intake in §1.1.
- **Blocks:** `P14-T04`'s allowlist, which is enforced *before* the token check. Also an infrastructure task for whoever owns the deployment.

### Q7 — Is the v2 response codec identical to D-022's?

- **Status:** UNANSWERED.
- **Hypothesis:** yes — AES-256-CBC keyed on `SHA-256("{consId}{secretKey}{timestamp}")` with the IV as the first 16 bytes of the same hash, then LZ-String `decompressFromEncodedURIComponent`, exactly as recorded in D-022. Evidence standing: good for PCare, untested for antrean.
- **How it gets answered:** decode the first real `ref/poli` response with the existing `decodeBpjsPcareResponse` unchanged. It either works byte-for-byte or it does not.
- **Blocks:** `P14-T03`. A match means the codec is reused as-is and only a header builder is new; a mismatch is a protocol difference to characterise before any adapter is written.

### Q8 — Does `X-Authorization` genuinely drop away?

- **Status:** UNANSWERED.
- **Hypothesis:** yes. PCare's `X-Authorization` carries a PCare web-app login and the fixed `kdAplikasi` `095`; there is no equivalent login for the Antrean service, so the header set should be `X-cons-id`, `X-timestamp`, `X-signature`, `user_key` only.
- **How it gets answered:** one authenticated `ref/poli` call without the header.
- **Blocks:** `P14-T03`'s header builder. Cheap to confirm, and confirming it is the point.

### Q9 — What does BPJS expect in `estimasidilayani`, and how is it checked at UAT?

- **Status:** UNANSWERED.
- **Hypothesis:** epoch milliseconds, and BPJS checks that it is present and plausible rather than accurate. HMS measures nothing about consultation duration today, so the first implementation is mechanical and honest — session start plus (position × a configured average minutes-per-patient) — with a per-doctor observed average as a later refinement once encounter durations have accumulated.
- **How it gets answered:** UAT acceptance criteria.
- **Blocks:** `P14-T04` (`ambil antrean` response) and `P14-T05` (`antrean/add` payload). Low risk, but it is a field HMS cannot currently compute from data it holds, so the fallback needs to be an accepted decision rather than an improvisation at UAT.

### Q10 — What identifies a Mobile JKN-originated booking?

- **Status:** UNANSWERED.
- **Hypothesis:** `kodebooking`, carried on the inbound `ambil antrean` and echoed on outbound calls.
- **How it gets answered:** the inbound contract (Q5).
- **Blocks:** the system-actor/provenance convention that `P14-T04` establishes and `P14-T05` depends on. Provenance is what stops the outbox re-publishing a Mobile JKN booking back to BPJS with `antrean/add` as though it were a walk-in — it is already BPJS's own row. This is why the provenance column is not optional, and it needs the real identifier, not a placeholder.

### Q11 — Is a development environment issued, and does UAT run against it or production?

- **Status:** UNANSWERED.
- **Hypothesis:** `antreanfktp_dev` exists and is issued alongside production, as it is for PCare.
- **How it gets answered:** branch office.
- **Blocks:** how `P14-T03`–`P14-T05` are verified before UAT day, and whether the "publicly reachable deployment" prerequisite applies to a staging host as well as production.

## 3. Fixtures to record

`P14-T02`'s second output. Record from **real responses**, never hand-written, and pin them the way D-022's are — as unit fixtures that fail loudly in CI when the protocol drifts, rather than as prose in a document.

- [ ] `ref/poli` and `ref/dokter` raw encrypted responses plus their decoded payloads, with the request timestamp that keys the decryption (Q7 depends on the timestamp being kept, so record it with the fixture).
- [ ] One `antrean/add` request/response pair.
- [ ] One `antrean/panggil` pair, and — only if Q1 says so — one `updatewaktu` pair.
- [ ] One `antrean/batal` pair.
- [ ] The inbound calls BPJS makes during UAT, captured as received: token issuance, and at minimum one `ambil antrean` and one `pasien baru`, since those are the write paths.
- [ ] Every error envelope encountered, including the `metaData.code` values, so the failure taxonomy is built from observed codes rather than guessed ones.

Redaction rule for anything committed: no card numbers, no NIK, no member names, no credentials or derived keys. Replace member identifiers with structurally valid synthetic values the way `phase-three-examples.ts` does, and note in the fixture that it was redacted.

## 4. Exit criteria for `P14-T02`

The spike is done when all of the following hold. Partial answers do not close it; they narrow it.

1. Every question in §2 carries a recorded answer, or an explicit written decision to proceed without it and what that costs.
2. ADR D-024 is updated from Proposed to Accepted, carrying the confirmed protocol facts in the shape D-022 uses (header table, codec steps, endpoint map, failure taxonomy).
3. The fixtures in §3 are recorded and committed, redacted.
4. Q1's answer is reflected in the plan: if task IDs apply, the registration-lifecycle change is scheduled as its own task rather than smuggled into `P14-T05`.
5. Q3's answer is reflected in the plan: if HFIS and PCare codes diverge, the HFIS-scoped mapping columns are scheduled before `P14-T03`.

## 5. What must not happen before those answers

Stated because the temptation is real and the cost is asymmetric:

- **No `BpjsAntreanConfig` schema, no adapter, no inbound module.** `P14-T03` and `P14-T04` are gated on Q2/Q4/Q5/Q7. Writing them against the hypotheses produces code that compiles, passes its own invented fixtures, and is wrong in ways UAT discovers.
- **No hand-written fixtures.** A fixture is evidence. One assembled from a reading of the spec is a restatement of the hypothesis wearing evidence's clothes, and it will pass every test written against it.
- **No public inbound route.** HMS has exactly two public routes today (`auth`, `health`) and neither writes. The third one is `P14-T04`, behind a purpose-built token guard, an IP allowlist, and per-endpoint rate limiting — all of which need Q4 and Q6 to exist first.
- **No promise to the clinic about a date.** The UAT slot, the profile flag, and the credentials are all on BPJS's timeline, not the project's.
