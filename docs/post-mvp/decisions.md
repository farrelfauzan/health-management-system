# Architectural Decision Record (Post-MVP)

Continuation of [docs/MVP/decisions.md](../MVP/decisions.md) (which ends at D-021). Same format; numbering continues.

## D-022: BPJS PCare Protocol Confirmation and Codec (P11-T01 Spike)

- **Status:** Accepted
- **Decision:** Adopt the community-documented PCare REST v3.0 wire protocol as the basis for the Phase 11 adapter, and land it as a pure codec utility in `apps/api/src/common/bpjs-pcare/` (`buildBpjsPcareHeaders`, `decodeBpjsPcareResponse`, typed `BpjsPcareCodecError`) with pinned fixtures. Defer live dev-environment verification until a facility-issued credential set exists.
- **Why:** BPJS publishes no official SDK and the Trust Mark portal is login-gated; the de-facto specification is the community reference implementations. Two independent PHP implementations ([antmey/bridging-bpjs](https://github.com/antmey/bridging-bpjs), [fadlyyy/bpjs-pcare](https://github.com/fadlyyy/bpjs-pcare)) agree exactly on every protocol detail below, and the spike's fixtures were additionally cross-checked against the openssl CLI (HMAC signature and AES layer byte-for-byte).
- **Consequence:** `P11-T02` builds the signature interceptor, config, and resilience layer on this codec unchanged. Because the response AES key is derived from the request timestamp, the adapter must generate the timestamp once per request and keep it until the response is decoded. Protocol facts are pinned in unit fixtures so a BPJS-side change fails loudly in CI, not silently in production.

### Confirmed protocol (PCare REST v3.0)

Request headers, rebuilt per request:

| Header | Value |
| --- | --- |
| `X-cons-id` | `consId` as issued |
| `X-Timestamp` | Unix seconds UTC, as a string |
| `X-Signature` | `Base64(HMAC-SHA256("{consId}&{timestamp}", secretKey))` (raw digest, then base64) |
| `X-Authorization` | `Basic Base64("{pcareUsername}:{pcarePassword}:095")` — `095` is the fixed PCare `kdAplikasi` |
| `user_key` | `userKey` as issued |

Response envelope is `{ metaData: { code, message }, response }`. `metaData.code` arrives inconsistently as string or number — the `P11-T02` adapter normalises it. When `response` is a string it is encrypted; error envelopes carry plain JSON (or nothing) and pass through undecoded. Decode order for encrypted payloads:

1. `keyMaterial = SHA-256("{consId}{secretKey}{timestamp}")` (raw 32 bytes) where `timestamp` is the value sent on the request; IV = first 16 bytes of the same hash.
2. AES-256-CBC-decrypt the base64 payload with that key/IV (PKCS#7 padding).
3. LZ-String `decompressFromEncodedURIComponent` the plaintext (dependency: `lz-string`, the reference JS implementation the PHP ports derive from).
4. `JSON.parse` the result.

Failure taxonomy in the codec: `BPJS_PCARE_RESPONSE_MALFORMED` (body or decoded payload not JSON, envelope missing), `BPJS_PCARE_DECRYPT_FAILED` (padding/key mismatch — typically a timestamp reuse bug), `BPJS_PCARE_DECOMPRESS_FAILED` (decrypt "succeeded" but plaintext is not LZ-String data). Messages never carry credentials, derived keys, or payload content.

Conventions confirmed alongside: dates are `dd-MM-yyyy`; base URL `https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0` (production; a separate dev base is issued with credentials); code systems are BPJS-specific (DPHO for medications, BPJS's own ICD-10 list, kd-coded poli/dokter/kesadaran/tindakan).

### Flow map (endpoints confirmed from the reference implementations)

| Flow | Endpoints | HMS source (Phase 11 task) |
| --- | --- | --- |
| Eligibility (peserta) | `GET peserta/{noKartu}`, `GET peserta/nik/{nik}` | Registration check-in (`P11-T04`) |
| Visit registration (pendaftaran) | `POST pendaftaran`; `DELETE pendaftaran/peserta/{noKartu}/tglDaftar/{dd-MM-yyyy}/noUrut/{noUrut}/kdPoli/{kdPoli}`; `GET pendaftaran/noUrut/{noUrut}/tglDaftar/{tgl}`; `GET pendaftaran/tglDaftar/{tgl}/{start}/{limit}` | `Registration` + `VitalSigns` (`P11-T05`) |
| Encounter (kunjungan) | `POST kunjungan`; `PUT kunjungan`; `GET kunjungan/peserta/{noKartu}`; `DELETE kunjungan/{noKunjungan}` | `Encounter` + `Diagnosis` (`P11-T05`) |
| Referral (rujukan) | Rides on the kunjungan payload (subspesialis/sarana/khusus fields); read back via `GET kunjungan/rujukan/{noKunjungan}` — no standalone create endpoint | Encounter close (`P11-T06`) |
| Medications (obat) | `GET obat/dpho/{keyword}/{start}/{limit}`; `GET obat/kunjungan/{noKunjungan}`; `POST obat/kunjungan`; `DELETE obat/{kdObatSK}/kunjungan/{noKunjungan}` | Dispense records (`P11-T05`) |
| Reference data | `poli`, `dokter`, `kesadaran`, `tindakan`, `diagnosa`, `spesialis`, `provider`, `statuspulang`, `kelompok` lookups | Sync tables (`P11-T03`) |

### Open item: facility credentials

Dev credentials were **not** obtainable in this spike: BPJS issues them per facility through its branch office (kantor cabang) under an active PKS, and HMS cannot register as a vendor ([bpjs-pcare.md](./bpjs-pcare.md) §1). The codec is therefore verified against two independent reference implementations plus an openssl cross-check, not against the live dev environment. First action once a pilot clinic's credentials arrive: run the `P11-T02` test-connection endpoint (a `poli` read) and re-record the pinned fixtures from a real response; any mismatch is a protocol drift to resolve before `P11-T03` onward.

## D-023: Antrean Online (Mobile JKN) Is Its Own Phase, Not a Phase 11 Task (P11-T08 Evaluation)

- **Status:** Accepted
- **Decision:** Adopt antrean online bridging as a product commitment, but **do not build it in Phase 11**. Land the evaluation as [bpjs-antrean-online.md](./bpjs-antrean-online.md) and schedule the work as Phase 14 (`P14-T01` … `P14-T06`), gated on a pilot clinic that already runs PCare bridging in production, a branch-office request for the **separate Antrean-service credentials**, and a deployment with a public IP that someone is accountable for. The one piece that is buildable today — per-poli queue numbering (`P14-T01`, the `P8-T06` follow-through) — is buildable independently and carries no BPJS dependency.
- **Why:** Antrean online is a second integration wearing the D-022 protocol, not a seventh PCare endpoint. Three properties put it outside Phase 11's shape:
  1. **It is bidirectional.** Everything Phase 11 built is HMS calling BPJS. Here BPJS calls HMS: the facility must host *get token*, *status antrean*, *ambil antrean*, *sisa antrean*, *pasien baru*, and *batal antrean*. `ambil antrean` and `pasien baru` are writes into bookings and patient master data reachable from the public internet — HMS has exactly two public routes today (`auth`, `health`), and neither writes. That is a new security boundary deserving its own review, not a task tacked onto a finished phase.
  2. **It cannot be proven without BPJS.** The PCare adapter was verified end to end against a signature-verifying fetch stub precisely because HMS was always the caller. The inbound contract is the facility's to publish and is confirmed only at BPJS's UAT (*Dokumen UAT Bridging Antrol v2.0 FKTP*, with a signed pakta integritas and a branch-office profile flag before Mobile JKN lists the clinic at all). Fixtures would test our reading of a thin, FKRTL-contaminated spec, not the spec.
  3. **Its prerequisites are outside the codebase.** Separate consId/secretKey/userKey issued for the Antrean service; poli, doctor, shift, and quota published from **HFIS**, which HMS cannot write; a public, always-reachable host. A self-hosted clinic behind NAT cannot run this feature no matter what ships.
- **Consequence:** `P11-T08` closes as an evaluation, and Phase 11 is complete. The evaluation names the model gaps so they are not rediscovered later: the `P8-T06` queue counter is keyed on date alone while antrean numbers are per-poli (`P14-T01` splits it, keeping the clinic-wide roll as the physical ticket); `AppointmentSession` already matches an HFIS shift with a quota, so a Mobile JKN booking lands as a session join rather than a new appointment concept; the `P7-T06`/`P7-T07` sealed-NIK blind index gives `pasien baru` dedupe-before-create for free, but a BPJS-originated write has no human actor, so the phase needs a system-actor/provenance convention — which doubles as the flag that stops the outbox from re-publishing a Mobile JKN booking back to BPJS as a walk-in; and HMS records no "patient called" event, so whether the FKTP flavour wants FKRTL's task-ID vocabulary decides whether that is a UX change or an approximation. HFIS is reconciled and reported, never synced. Whichever way `P14-T02` resolves the open protocol questions, the outbound half reuses the D-022 codec and HMAC builder unchanged — only the `X-Authorization` header (PCare's `kdAplikasi` login) drops away.

## D-024: The Antrean Spike Stays Open Until Credentials Exist (P14-T02)

- **Status:** **Proposed — blocked on facility credentials.** This ADR is deliberately unfinished. It becomes Accepted when `P14-T02` answers the questions registered in [bpjs-antrean-spike.md](./bpjs-antrean-spike.md) §2, and it is updated in place rather than superseded.
- **Decision:** Do **not** write the `P14-T02` ADR from the reference implementations. Stage the spike instead: record what must be obtained from the branch office, register every open protocol question with its current hypothesis and evidence standing, name what each answer unblocks, and state plainly what must not be built before the answers exist. `P14-T03` onward stay unstarted.
- **Why:** `P14-T02`'s output is an ADR plus recorded fixtures, and both require the pilot clinic's Antrean-service credentials, which BPJS issues per facility through its branch office under a signed pakta integritas. The credentials do not exist. An ADR written now would be assembled from the same community sources D-022 used, but without D-022's saving grace: there, two independent implementations agreed exactly and an openssl cross-check confirmed the codec byte-for-byte, so the document recorded verified facts with one open item. Here the FKTP material is thinner and mixes freely with the better-documented FKRTL flavour, and the largest open question — whether FKTP uses FKRTL's task-ID vocabulary or only `panggil` — changes how many lifecycle events HMS must emit and whether the registration lifecycle needs a "patient called" event it does not have today. An ADR is a record of decisions taken on evidence; one written to fill the slot would read as authoritative to the next reader and be guesswork, and the evaluation already made the narrower version of this point about fixtures: *"Fixtures test our reading of the spec, not the spec."*
- **Consequence:** Phase 14 is paused after `P14-T01` (per-poli queue numbering, shipped — it was always the only task with no external dependency). The spike document is the deliverable in the meantime, and it is written so that whoever runs the real spike does discovery, not rediscovery: the credential intake is a checklist, each question names the task it blocks, and the fixture list says record-from-real-responses with a redaction rule. Two answers are flagged as potentially schedule-changing rather than merely informational — if task IDs apply, the registration-lifecycle event becomes its own task instead of being smuggled into `P14-T05`; if HFIS and PCare poli/doctor codes diverge, HFIS-scoped mapping columns must be scheduled before `P14-T03`. Phase 15 is explicitly independent of Phase 14 and remains available to run in the meantime.
