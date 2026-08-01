# BPJS Antrean Online — `P14-T06` UAT Support

Working document for `P14-T06` in [implementation-plan.md](./implementation-plan.md). Companion to [bpjs-antrean-spike.md](./bpjs-antrean-spike.md), whose question register this session is what finally closes, and to the operational [onboarding runbook](../ops/bpjs-antrean-onboarding-runbook.md).

**Standing of this document.** `P14-T06`'s stated output is a completed BPJS checklist run against a deployed pilot plus fixtures re-recorded from real responses. Both require a pilot clinic with issued credentials, a public deployment, and a booked UAT slot. **None of those exist**, so this document holds the half that can be prepared without them: what to run, in what order, what each step settles, and the instrument that turns the session into evidence. The rest is not writable in advance and is deliberately left blank.

This is the one task in Phase 14 that cannot be built ahead of the spike. `P14-T03`, `P14-T04` and `P14-T05` all shipped on the spike's hypotheses because code can be written against a hypothesis and labelled as such. A UAT run cannot: it *is* the act of finding out.

## 1. What the session settles

Every open question in the spike register resolves in one sitting, which is why the preparation is worth this much care. Mapped to the checklist steps in §3:

| Question | Settled by | Step |
| --- | --- | --- |
| Q2 — outbound endpoint set, base URLs | The first `ref/poli` that returns 200 | 3.1 |
| Q7 — is the v2 codec identical to D-022's | Whether that response decodes with `decodeBpjsPcareResponse` unchanged | 3.1 |
| Q8 — does `X-Authorization` drop away | The same call, made without it | 3.1 |
| Q3 — do HFIS codes match the PCare catalog | Diffing the decoded `ref/poli` against the synced `POLI` catalog | 3.2 |
| Q11 — is a development environment issued | Whether the dev base URL answers at all | 3.1 |
| Q4 — inbound token scheme | BPJS's first call to the facility's token endpoint | 3.4 |
| Q5 — inbound service contracts | The inbound calls, captured as received | 3.4–3.6 |
| Q6 — BPJS source IPs | Confirmed by the allowlist admitting the real calls | 3.4 |
| Q1 — task IDs or `panggil` | The UAT checklist's own enumeration, then one live call | 3.8 |
| Q9 — `estimasidilayani` | Whether BPJS accepts the computed value | 3.7 |
| Q10 — Mobile JKN booking identity | Which field the inbound `ambil antrean` carries | 3.5 |
| failure taxonomy | Every error envelope observed across the session | all |

## 2. Before the session

The operational prerequisites are the runbook's steps 1–14 and must all be done days earlier — a UAT slot spent discovering that the facility profile flag was never set is a slot wasted.

Immediately before starting:

- [ ] Enable capture: `BPJS_PROTOCOL_CAPTURE_DIR=/var/opt/hms/bpjs-uat` (or any access-controlled path). The API warns at boot while it is on.
- [ ] Confirm the capture file is empty, so the session's contents are unambiguous.
- [ ] Have the BPJS *Dokumen UAT Bridging Antrol v2.0 FKTP* checklist open — **it is the contract**, and where it disagrees with this document, it wins.
- [ ] Have someone who can edit HFIS (Antrean Faskes portal) reachable.

## 3. Checklist

Run in this order: outbound reads first (they are side-effect-free and settle the most questions per call), then inbound, then the write paths.

### 3.1 Outbound reference read — `ref/poli`

Admin → Integrations → BPJS Antrean → **Test connection**.

Settles Q2, Q7, Q8, Q11 at once. Record the outcome exactly:

- **Success** — the four-header set, the base URL, the endpoint path and the D-022 codec are all confirmed together.
- `BPJS_ANTREAN_UNAUTHORIZED` — signature or header set is wrong. Q8 is the first suspect: try restoring `X-Authorization`.
- `BPJS_ANTREAN_DECRYPT_FAILED` / `BPJS_ANTREAN_DECOMPRESS_FAILED` — Q7 resolved *against* the hypothesis. This is the highest-value finding of the session; capture the raw body and the request timestamp before changing anything.
- A transport failure — base URL or network, not protocol.

### 3.2 Outbound reference read — `ref/dokter`, and the Q3 diff

Run **HFIS reconciliation**. Diff the returned poli and doctor codes against the synced PCare `POLI`/`DOKTER` catalogs.

If they diverge, Q3 is resolved against the hypothesis and `Specialty.bpjsPoliCode` / `DoctorProfile.bpjsDoctorCode` need HFIS-scoped siblings. **Stop and schedule that work** — do not remap the PCare columns to HFIS values, which would silently break claim submission.

### 3.3 Confirm the facility is listed

Check that the clinic appears in Mobile JKN with its poli and shifts. If it does not, the branch office has not set the queue-system flag and nothing below can run.

### 3.4 Inbound — token issuance

BPJS calls the facility's token endpoint with the agreed credential pair.

- [ ] The call is admitted (Q6: the allowlist holds the right ranges).
- [ ] A token is issued.
- [ ] Record **which header BPJS then carries the token on**, its encoding, and its lifetime — this is Q4, and `TOKEN_HEADER` in `bpjs-antrean-inbound-token.guard.ts` is the single line that changes.
- [ ] Ask BPJS what it does when a token expires mid-session; HMS's stateless scheme has no server state to reconcile, but the lifetime should be set to match.

If the call never arrives, check the audit trail for `BPJS_ANTREAN_INBOUND_CALL_REJECTED` before suspecting the network: `SOURCE_IP_NOT_ALLOWED` means the ranges are wrong and is invisible from outside by design.

### 3.5 Inbound — `status antrean`, `sisa antrean`, `pasien baru`, `ambil antrean`

Run each service from BPJS's side. For every one, record the **request field names as received** — this is Q5, and HMS's schemas are currently a reading of a circulated document.

- [ ] `status antrean` — a read; safest to run first.
- [ ] `pasien baru` — creates a patient. Confirm the MRN returned is the one HMS allocated, and that a **repeat call for the same member returns the same MRN** rather than creating a second record.
- [ ] `ambil antrean` — creates the booking. Record which field identifies it (Q10) and confirm the queue number and `estimasidilayani` are accepted.
- [ ] `sisa antrean` — confirm it addresses the booking the way `ambil antrean` returned it.

### 3.6 Inbound — `batal antrean`

- [ ] Cancel the booking from 3.5 and confirm HMS marks the appointment cancelled.
- [ ] Confirm no `ANTREAN_BATAL` outbox row is created — the booking was BPJS's own, and HMS must not publish a cancellation back for a queue entry it never published.

### 3.7 Outbound — `antrean/add` for a walk-in

Register and check in a **walk-in** JKN patient with an appointment.

- [ ] An `ANTREAN_ADD` row appears in the submissions monitor and reaches SUBMITTED.
- [ ] The member's queue number appears in Mobile JKN.
- [ ] `estimasidilayani` is accepted (Q9). If BPJS validates it more strictly than "present and plausible", record what it expects.

Then repeat with a **Mobile JKN-originated** visit and confirm **no** `ANTREAN_ADD` row is created. This is the provenance rule and the single most important negative result of the session.

### 3.8 Outbound — `antrean/panggil` and `antrean/batal`

- [ ] Open the encounter for the walk-in from 3.7; confirm `ANTREAN_PANGGIL` reaches SUBMITTED and the progress shows in Mobile JKN.
- [ ] Confirm with BPJS whether the single `sedang dilayani` status is sufficient, or whether the FKTP flavour expects the full FKRTL task-ID set. **This is Q1.** If task IDs apply, HMS has no "patient called" event to report and that becomes its own scheduled task — do not improvise a timestamp on the day.
- [ ] Cancel a published walk-in registration; confirm `ANTREAN_BATAL` reaches SUBMITTED and the entry disappears from Mobile JKN.

## 4. Recording the fixtures

The capture file is raw material, not the deliverable. Converting it:

1. Copy the NDJSON off the host to an access-controlled location and **unset `BPJS_PROTOCOL_CAPTURE_DIR`, then restart**.
2. Confirm every line carries `"redacted": true`. Credentials, signatures and the inbound token are already removed, and member identifiers are already replaced with structurally valid synthetic values — but **read the file before committing anything**. Redaction is automated, and automated redaction is exactly the kind of thing that is wrong in the one case nobody checked.
3. Commit fixtures the way D-022's are: as unit fixtures that fail loudly in CI when the protocol drifts, not as prose. Keep the request timestamp with every outbound response — the response AES key derives from it, and a fixture without it cannot be decoded again.
4. Cover at minimum what the spike's §3 list names: `ref/poli` and `ref/dokter` raw and decoded, one `antrean/add` pair, one `panggil` pair, one `batal` pair, the inbound token issuance, one inbound `ambil antrean`, one inbound `pasien baru`, and **every error envelope encountered**.
5. Destroy the raw capture once the fixtures are committed.

**Never hand-write a missing fixture.** A fixture assembled from a reading of the spec is the hypothesis wearing evidence's clothes and will pass every test written against it. A gap in the fixture set is a gap to record as such and fill at the next session.

## 5. Closing the spike

`P14-T02` closes when, and only when:

1. Every question in the spike's §2 register carries a recorded answer, or an explicit written decision to proceed without it and what that costs.
2. ADR D-024 moves from Proposed to Accepted, carrying the confirmed protocol facts in the shape D-022 uses — header table, codec steps, endpoint map, failure taxonomy.
3. The §3 fixtures are recorded, redacted and committed.
4. Q1's answer is reflected in the plan: if task IDs apply, the registration-lifecycle event is scheduled as its own task.
5. Q3's answer is reflected in the plan: if HFIS and PCare codes diverge, the HFIS-scoped mapping columns are scheduled.

## 6. Session record

Left blank deliberately. Fill in on the day; an entry written in advance is a prediction, and this file exists to hold evidence.

- **Date:**
- **Facility / consId:**
- **Environment (dev or production):**
- **BPJS participants:**
- **Checklist steps completed:**
- **Questions resolved, and against or in favour of the hypothesis:**
- **Fixtures recorded:**
- **Follow-up work scheduled:**
