# BPJS Antrean Online Onboarding Runbook

Operational steps to take one clinic from "no antrean bridging" to "listed in Mobile JKN". Companion to [bpjs-antrean-uat.md](../post-mvp/bpjs-antrean-uat.md), which covers the UAT session itself.

Most of this is not a code path. Steps 1–4 are requests to other organisations and take weeks; nothing in HMS shortens them, and starting them late is the usual reason a pilot slips.

## Prerequisites

1. Confirm the clinic is **already running PCare bridging in production**. Antrean is worth nothing until the visits it queues are also being claimed.
2. Confirm the deployment has a **public IP, a valid TLS certificate, and a named owner accountable for uptime**. BPJS calls the facility; a deployment behind NAT cannot run this feature at all. Settle this before anything else — it is the one prerequisite that can disqualify a clinic outright.

## Branch office request

3. Ask the clinic's BPJS branch office (kantor cabang) for **Antrean-service credentials**: `consId`, `secretKey`, `userKey`. Confirm in writing that these are distinct from the PCare set already in `BpjsPcareConfig` — the two are separately issued and separately revoked, and losing one must not disable the other.
4. In the same request, obtain:
   - the **base URLs actually issued**, production and development, and whether a development environment is issued at all;
   - the **source IP ranges BPJS will call from** — without these the inbound surface stays closed (see step 9);
   - confirmation that the **facility profile is flagged as having a queue system**. Until the branch office sets this flag, Mobile JKN does not list the clinic no matter what HMS does.
5. Sign the **pakta integritas** and book the UAT slot (*Dokumen UAT Bridging Antrol v2.0 FKTP*).

## Credential intake

6. Confirm `BPJS_CREDENTIAL_ENCRYPTION_KEY` is set on the deployment. Without it the API refuses to store BPJS credentials rather than storing them in the clear.
7. Enter the outbound credentials in **Admin → Integrations → BPJS Antrean**. Secrets are write-only: the form shows last-4 display values and never returns a stored secret. Never paste a credential into a tracked file, a ticket, or a chat message.
8. Run **Test connection**. It reads `ref/poli`, the only side-effect-free endpoint in the set, and proves signature validity, credential acceptance and response decryption in one round trip. A failure reports BPJS's own readable reason; treat a decode failure as a protocol finding, not a configuration error, and record it (see the UAT document).

## Opening the inbound surface

9. Set `BPJS_ANTREAN_INBOUND_ALLOWED_IPS` to the ranges from step 4, comma-separated. **This is the switch.** Until it is set, every inbound request is refused before it is parsed, and the clinic has no public write path. A malformed entry fails startup rather than being skipped.
10. If the API sits behind a load balancer or reverse proxy that rewrites `X-Forwarded-For`, set `BPJS_ANTREAN_INBOUND_TRUSTED_PROXY_HOPS` to the number of hops you control. Leave it at `0` otherwise — with `0` the socket address decides and the header is ignored, so a caller cannot claim to be BPJS with a header they control.
11. Record the **inbound credential pair** BPJS agreed at UAT in the same admin screen. The password is hashed, never sealed, and cannot be read back; rotating it invalidates every issued token immediately.
12. Confirm readiness at **Admin → Integrations → BPJS Antrean → inbound readiness**. It reports which precondition is still missing rather than a bare yes/no.

## Mapping and schedule alignment

13. Map every poli to its HFIS `kodepoli` and every practitioner to their `kodedokter` in **BPJS mappings**. Whether HFIS codes match the synced PCare catalog is unconfirmed — do not assume they agree.
14. Run **HFIS reconciliation** and clear the findings. `NO_OPEN_SESSION` is the one that costs a patient something: Mobile JKN will let a member book a shift HFIS advertises, and the booking then fails on someone already holding a queue number. HMS never writes HFIS — fix each finding in whichever system is wrong.

## UAT and cutover

15. Enable protocol capture for the session only: set `BPJS_PROTOCOL_CAPTURE_DIR` to a directory on an access-controlled host. The API logs a warning at every boot while it is on.
16. Run the UAT checklist in [bpjs-antrean-uat.md](../post-mvp/bpjs-antrean-uat.md).
17. **Unset `BPJS_PROTOCOL_CAPTURE_DIR` and restart** once UAT is complete. Capture writes BPJS traffic to disk; it is a UAT instrument, not telemetry.
18. Move the captured file to an access-controlled location, convert it to committed fixtures per the UAT document's recording rules, and destroy the raw capture.
19. Watch **Admin → Integrations → submissions monitor**, filtered to the `ANTREAN_*` types, for the first days of live traffic. A cluster of failures with the same readable reason is a mapping gap, not an outage.

## Rotating or revoking credentials

20. Re-enter the outbound secrets in the admin screen. Rotation is immediate; there is no cache to clear.
21. Re-enter the inbound password to revoke every outstanding BPJS token at once — tokens are signed with a key derived from the stored hash, so a new hash invalidates them without a revocation list.
22. To take the facility off Mobile JKN, ask the branch office to clear the queue-system flag. Clearing HMS configuration stops the clinic answering, but only the branch office stops BPJS advertising it.
