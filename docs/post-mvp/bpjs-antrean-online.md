# BPJS Antrean Online (Mobile JKN) Bridging — Evaluation

Output of `P11-T08` in [implementation-plan.md](./implementation-plan.md). Companion to [bpjs-pcare.md](./bpjs-pcare.md) §6.3 item 6, which deferred this feature until the core PCare flows landed. The decision this note argues for is recorded as ADR D-023 in [decisions.md](./decisions.md).

**Verdict: adopt, but not inside Phase 11.** Antrean online is a second BPJS integration wearing the same protocol, not a seventh PCare endpoint — a separate service registration, a separate credential set, an *inbound* web service that HMS must host on a public address for BPJS to call, a schedule/quota source of truth (HFIS) outside HMS, and a per-poli queue model the `P8-T06` clinic-wide antrian does not have. It gets its own phase (Phase 14), and its prerequisites are named in §7.

## 1. What It Is

Mobile JKN's *Pendaftaran Pelayanan* lets a JKN member take a queue number at their registered FKTP from their phone: they pick the poli and the doctor's shift, receive a queue number and an estimated service time, and can watch the queue advance or cancel. For the clinic, bridging it means the participant's booking appears in HMS automatically, and the clinic's own onsite queue and service progress flow back to BPJS so the app shows real numbers.

Two things make it structurally different from everything Phase 11 built:

- **It is bidirectional.** PCare bridging is HMS calling BPJS. Antrean online is HMS calling BPJS (to publish onsite queue entries and service progress) *and* BPJS calling HMS (to take a queue number on the member's behalf, read remaining queue, register a new patient, cancel). The inbound half is the product — without it, Mobile JKN cannot book into the clinic.
- **It is contractually gated.** BPJS runs a UAT (*Dokumen UAT Bridging Antrol v2 FKTP*) against the clinic's live endpoints with a signed pakta integritas, and the branch office flips the facility's "queue system available" flag in its profile before Mobile JKN will list the clinic at all. There is no fixture-only path to done, unlike D-022's codec.

## 2. Protocol

Same evidentiary standing as D-022: assembled from community reference implementations and circulated BPJS UAT/spec documents, **not** verified against a live BPJS environment, because credentials are issued per facility. Treat every field name below as a hypothesis to confirm during the spike.

### 2.1 Registration and credentials

Antrean is its own service in the BPJS API gateway with its own consumer ID, secret key, and user key — **distinct from the PCare set already stored in `BpjsPcareConfig`**. Base URLs:

| Environment | Base |
| --- | --- |
| Production | `https://apijkn.bpjs-kesehatan.go.id/antreanfktp` |
| Development | `https://apijkn-dev.bpjs-kesehatan.go.id/antreanfktp_dev` |

(`antreanrs` / `antreanrs_dev` is the FKRTL sibling and is out of scope — HMS targets klinik pratama.)

Beyond credentials, BPJS requires the facility to expose a reachable public endpoint for the inbound half; circulated FKTP checklists specify a public IP, TLS, and a bandwidth/uptime floor. This is an infrastructure commitment, not a code path.

### 2.2 Outbound: HMS → BPJS

Headers are the Antrean-service variant of the D-022 scheme — `X-cons-id`, `X-timestamp`, `X-signature` (`Base64(HMAC-SHA256("{consId}&{timestamp}", secretKey))`), `user_key` — **without** PCare's `X-Authorization`/`kdAplikasi` header, since there is no PCare web-app login involved. Responses in v2 are encrypted and LZ-String compressed exactly as PCare's are, keyed on the request timestamp.

| Purpose | Endpoint | Notable payload fields |
| --- | --- | --- |
| Publish an onsite (walk-in) queue entry | `POST antrean/add` | `kodebooking`, `jenispasien` (`JKN`), `nomorkartu`, `nik`, `nohp`, `kodepoli`, `namapoli`, `norm`, `tanggalperiksa`, `kodedokter`, `namadokter`, `jampraktek`, `nomorantrean` (`A-12`), `angkaantrean` (`12`), `estimasidilayani` (epoch ms), `keterangan` |
| Report queue progress / call | `POST antrean/panggil` | `tanggalperiksa`, `kodepoli`, `nomorkartu`, `status`, `waktu` |
| Cancel a queue entry clinic-side | `POST antrean/batal` | `tanggalperiksa`, `kodepoli`, `nomorkartu`, `alasan` |
| Poli reference (from HFIS) | `GET ref/poli` | HFIS poli codes for this facility |
| Doctor reference (from HFIS) | `GET ref/dokter` | HFIS doctor codes for this facility |

The FKRTL flavour of this API reports service progress as numbered task IDs (`antrean/updatewaktu` with `taskid` 1–7 plus 99 for no-show, `antrean/getlisttask` to read back what was sent). Whether the FKTP flavour uses the same task-ID vocabulary or only the simpler `panggil` status/time pair is **the first thing the spike must settle** — it decides how many lifecycle events HMS has to emit and, per §3.5, whether HMS has to model events it does not record today.

### 2.3 Inbound: BPJS → HMS

These are the services the *facility* implements. BPJS authenticates against them with a token the facility issues: BPJS posts a username/password pair (agreed at UAT) to a token endpoint and carries the returned token on subsequent calls.

| Service | Method | What HMS must do |
| --- | --- | --- |
| Get token | POST | Validate the BPJS-side username/password, return a short-lived token |
| Status antrean | GET | Per poli/doctor/date: current number being served, remaining, whether booking is open |
| Ambil antrean | POST | **Create the booking**: allocate a per-poli queue number for a member on a given doctor/shift/date and return it with an estimate |
| Sisa antrean | GET | For one member's existing booking: how many are ahead, current number |
| Pasien baru | POST | Register a member who has no record at this clinic (name, NIK, card number, DOB, sex, phone, address) and return the MRN |
| Batal antrean | POST | Cancel that member's booking |

`Ambil antrean` and `Pasien baru` are unauthenticated-by-JWT **writes into clinical master data from the public internet**. That is the single largest new risk surface this feature introduces, and §4.2 is the mitigation.

### 2.4 HFIS is the schedule source of truth

Mobile JKN renders poli, doctors, shift times, and per-shift quota from **HFIS** (the BPJS facility information system the clinic maintains in the Antrean Faskes / Aplicares portal), not from anything HMS publishes. HMS therefore does not own what the member sees; it owns whether it can honour it. Drift — a shift in HFIS that HMS has no `AppointmentSession` for, or a quota HFIS thinks is 40 and HMS thinks is 20 — surfaces as `ambil antrean` failures with a patient already holding a screenshot. §4.3 proposes a reconciliation surface rather than a sync.

## 3. Fit Against HMS Today

Where the existing model already fits, and where it does not. Line references are to the current schema and modules.

### 3.1 The queue is clinic-wide; antrean is per-poli — **gap**

`QueueCounter` is keyed on `queue_date` alone (`schema.prisma`), an explicit `P8-T06` decision: one ticket roll for the whole clinic, with the note that "a per-poli split arrives with the BPJS poli mapping (`P11-T03`)". `P11-T03` mapped poli onto `Specialty.bpjsPoliCode` but left the counter alone, because submissions only ever needed the code, never a per-poli sequence.

Antrean online needs one: `antrean/add` carries `kodepoli` with `nomorantrean`/`angkaantrean`, and `status antrean` / `sisa antrean` are answered per poli. This is the `P8-T06` follow-through, and it is the first task of the phase — a composite `(queueDate, specialtyId)` counter consumed by the same atomic `INSERT … ON CONFLICT … RETURNING` upsert, with the clinic-wide number kept as the physical ticket the front desk hands out. Two numbers, deliberately: the paper roll is a floor-management artefact and the antrean number is a BPJS contract, and collapsing them would make every poli split renumber the clinic.

### 3.2 Specialty ↔ poli and doctor codes — **fits**

`Specialty.bpjsPoliCode` and `DoctorProfile.bpjsDoctorCode` already exist and are already admin-managed with validation against a synced catalog (`P11-T03`). Antrean's poli/doctor references come from **HFIS**, not PCare, so the codes may or may not be the same values — the spike must compare `ref/poli` against the synced PCare `POLI` catalog. If they diverge, the mapping columns need an HFIS-scoped sibling; if they agree, the existing mapping is reused as-is. Do not assume they agree.

### 3.3 Sessions ↔ jadwal dokter — **fits structurally, needs reconciliation**

`AppointmentSession` (`doctorId`, `sessionDate`, `startTime`/`endTime`, `maxPatients`, `OPEN|CLOSED|CANCELLED`) is a near-exact match for an HFIS shift with a quota, and `Appointment.type = SESSION` already models "patient joins a doctor's session" — which is precisely what a Mobile JKN booking is. `ambil antrean` therefore lands as a session join, not a new appointment concept. What is missing is any assurance that the session exists and is open; see §4.3.

### 3.4 Patient creation from `pasien baru` — **fits**

The identifier machinery from `P7-T06`/`P7-T07` is exactly what this needs: NIK sealed with a unique blind index (`nikIndex`), BPJS card number sealed the same way, MRN allocated from `MrnCounter`. Dedupe-before-create is a blind-index lookup that already exists, so a returning member does not get a second record. The gap is not data, it is **actorship**: `Registration`, `Appointment`, and audit rows all carry a `createdById`/actor `User`, and a BPJS-originated write has no human actor. The phase needs a system-actor convention (a reserved service user, or nullable actor plus an explicit provenance column) applied consistently across the rows an inbound call creates.

### 3.5 Service-progress events — **partial gap**

`panggil`/`updatewaktu` report *when* each step happened. HMS records arrival (`Registration.CHECKED_IN`), consultation start (`Encounter` opens `IN_PROGRESS`), consultation end (`FINISHED`), and dispense — but there is **no "patient called" event**: `RegistrationStatus` goes `PENDING → CHECKED_IN → COMPLETED`, and the doctor's act of calling the next patient is not captured anywhere. If the FKTP flavour turns out to want the FKRTL task-ID set, HMS must either add that event to the registration lifecycle (a real UX change on the doctor's queue screen, not a schema tweak) or send the encounter-open time as an approximation and accept that BPJS's dashboard shows called-time ≈ served-time. Decide this with the spike's answer to §2.2, not before.

### 3.6 `estimasidilayani` — **gap, small**

Both `antrean/add` and `ambil antrean` return an estimated service time. HMS measures nothing about how long a consultation takes. The first implementation should be honest and mechanical — session start plus (position × a configured average minutes-per-patient) — with the per-doctor observed average as a later refinement once encounter durations have accumulated.

### 3.7 Public inbound surface — **gap, and the security-relevant one**

`@PublicRoute()` is used in exactly two places today (`auth`, `health`); everything else is behind `JwtAuthGuard` + `PermissionsGuard`. The inbound WS is a third public surface, and unlike the other two it writes patients and bookings. See §4.2.

## 4. Architecture If Adopted

### 4.1 A second config, not a column on the first

A new `BpjsAntreanConfig` row (nullable-unique `facilityId`, the same partial-unique singleton index trick as `BpjsPcareConfig`) holding `consId`/`kdProviderPpk` plaintext, `secretKey`/`userKey` sealed by the existing `BpjsCredentialCryptoService` under the same `BPJS_CREDENTIAL_ENCRYPTION_KEY`, plus the inbound half's issued username and a hashed password, `isActive`, `lastTestedAt`/`lastTestResult`. Separate row because the credentials are separately issued and separately revoked: a clinic can run PCare bridging without antrean, and losing one credential set must not disable the other.

The outbound adapter reuses `decodeBpjsPcareResponse` and the HMAC builder unchanged (same algorithms, D-022) behind a thin Antrean-specific header builder that drops `X-Authorization`. The circuit breaker, retry policy, and error taxonomy come from `BpjsPcareHttpClient` — extract the shared parts rather than forking it.

### 4.2 The inbound surface is its own module with its own guard

A dedicated controller under a distinct path prefix (e.g. `/api/v1/bpjs/antrean/ws/*`), `@PublicRoute()`, and a purpose-built `BpjsAntreanTokenGuard` — never `JwtAuthGuard`, never a permission bypass. Non-negotiables:

- Token issuance validates against the stored inbound credential (hashed, never reversible); tokens are short-lived and carry no HMS identity.
- Source-IP allowlist of BPJS's published ranges, configured per deployment, enforced before the token check.
- Per-endpoint rate limiting, because the write endpoints are reachable by anyone who finds the host.
- Every inbound call audits — endpoint, outcome, and the member identifier hashed, never the card number.
- Responses use BPJS's own envelope (`metaData.code`/`message`), not the HMS `{ data }` envelope. This is the one place in the API where the response convention is BPJS's, and it belongs in a controller whose whole job is speaking someone else's protocol.
- The module calls domain **services** (patient-management, appointment-management, registration-flow), never repositories — the ordinary cross-module rule, and here it is also what keeps the business invariants (MRN allocation, dedupe, quota) on the one path.

### 4.3 Reconciliation, not sync, for HFIS

HMS cannot write HFIS. So: a settings screen that reads `ref/poli` and `ref/dokter`, compares them against mapped specialties/doctors and the next N days of `AppointmentSession` rows, and lists the mismatches — "HFIS lists dr. X Senin 08:00–12:00; no open session in HMS", "Specialty Umum has no HFIS poli code". The clinic fixes it in whichever system is wrong. An `ambil antrean` for a shift with no open session is refused with a readable BPJS-side message; refusing legibly is better than accepting a booking the clinic cannot honour.

### 4.4 Outbound publishing rides the existing outbox

`antrean/add` (walk-ins), `panggil`, and `batal` are enqueued transactionally from the same host repositories that already enqueue PCare rows, as new `BpjsSubmissionType` values processed by the same worker with the same backoff and the same monitor. The `P11-T07` Integrations monitor gains the new types for free. **One deviation**: a Mobile JKN-originated booking must *not* be re-published with `antrean/add` — it is already BPJS's own row. Provenance (§3.4) is what tells the enqueue hook to skip, which is a second reason that column is not optional.

## 5. Proposed Task Breakdown (Phase 14)

1. `P14-T01` Per-poli queue numbering: composite `(queueDate, specialtyId)` counter alongside the clinic-wide roll, allocated in the same registration transaction, exposed on the queue board. The `P8-T06` follow-through; the only task with no external dependency, and independently useful for a multi-poli clinic.
2. `P14-T02` Spike: obtain Antrean-service credentials for the pilot clinic; confirm the FKTP endpoint set, whether task IDs apply (§2.2), whether HFIS poli/doctor codes match the PCare catalog (§3.2), and the inbound token scheme. Output: ADR + recorded fixtures.
3. `P14-T03` `BpjsAntreanConfig` + outbound adapter reusing the D-022 codec; admin settings surface with write-only secrets and test connection (`ref/poli`). **Done** — built ahead of `P14-T02` and on that spike's hypotheses rather than its answers; see [implementation-plan.md](./implementation-plan.md) §9 and [bpjs-antrean-spike.md](./bpjs-antrean-spike.md) §3.1 and §5. §4.1's "extract the shared parts rather than forking it" was taken literally: the PCare client's resilience policy and envelope reading now live in a service-agnostic `common/bpjs-gateway/` transport that both services drive, with one circuit breaker each.
4. `P14-T04` Inbound WS module: token guard, IP allowlist, rate limiting, the six services, system-actor provenance, audit. The security-critical task — review it as such.
5. `P14-T05` Outbound publishing: `add`/`panggil`/`batal` as new outbox types with the provenance skip; HFIS reconciliation screen.
6. `P14-T06` UAT support: run the BPJS checklist against the deployed pilot, re-record fixtures from real responses, and write the onboarding runbook entry (branch-office request, public-IP requirement, credential intake, UAT walkthrough).

## 6. Risks

- **Inbound writes from the public internet.** Mitigated by §4.2, but the residual risk is real and permanent: the clinic's patient table becomes writable by whoever can reach the host and pass a token check. This is the reason the feature is not worth shipping speculatively.
- **Cannot be validated without BPJS.** The PCare work could be proven end to end against a signature-verifying fetch stub because HMS was always the caller. Here BPJS is the caller, and the contract HMS publishes is only confirmed at UAT. Fixtures test our reading of the spec, not the spec.
- **Ops commitment.** A public, always-reachable endpoint with an uptime expectation is a different operational posture than an outbound-only integration; a self-hosted clinic deployment behind NAT cannot do it at all.
- **Schedule drift (§4.3).** The failure lands on a member who already has a queue number on their phone — the worst possible place for it.
- **Protocol uncertainty is higher than D-022's.** PCare had two independent implementations agreeing exactly. The FKTP antrean material is thinner and mixes freely with the better-documented FKRTL flavour; `P14-T02` is a real spike, not a formality.

## 7. Prerequisites Before Starting

1. A pilot clinic with active PCare bridging in production — antrean is worth nothing until the visits it queues are also being claimed.
2. That clinic's branch-office request for **Antrean-service** credentials, and its facility profile flagged as having a queue system.
3. A deployment with a public IP, TLS, and someone accountable for its uptime.
4. `P14-T01`, which is the only piece that can be built today and should be, whenever a second poli makes the clinic-wide roll awkward.

Until 1–3 exist, the correct state of this feature is this document plus [bpjs-antrean-spike.md](./bpjs-antrean-spike.md), which stages `P14-T02` — the credential intake to run against 1–3, and the question register the spike answers once they are met. `P14-T01` shipped; it never depended on any of them.

## 8. Sources

- Mobile JKN FKTP queue user manual: https://bpjs-kesehatan.go.id/user-manual-mobile-jkn/mobilejkn/antreanfktp.html
- Antrean Faskes portal (FKTP): https://antrean.bpjs-kesehatan.go.id/antrean-faskes/
- Dokumen UAT Bridging Antrol v2.0 FKTP (circulated BPJS UAT checklist — inbound/outbound service split, token scheme, UAT items): https://www.slideshare.net/slideshow/dilengkapi-pelanggan-dokumen-uat-bridging-antrol-versi-2-0-fktp-final-pdf/272743433
- Antrol v2 bridging walkthrough (base URLs, encrypted-response handling): https://bitupsolution.wordpress.com/2023/03/01/tutorial-bridging-vclaim-dan-antrean-online-antrol-versi-2-bpjs/
- Reference implementations carrying the Antrean service (payload field names, separate consId/userKey): https://github.com/indravscode/bridging-bpjs , https://github.com/virusphp/bridging-bpjs , https://github.com/ssecd/jkn
- Khanza FKTP antrean bridge (inbound WS shape): https://github.com/apriansyah2012/api-bpjs-fktp
- BPJS Trust Mark API catalog (login-gated, authoritative once credentials exist): https://dvlp.bpjs-kesehatan.go.id:8888/trust-mark/portal.html
