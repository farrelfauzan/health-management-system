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
