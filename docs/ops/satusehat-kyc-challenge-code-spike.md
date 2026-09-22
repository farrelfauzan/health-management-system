# SATUSEHAT KYC challenge-code probe (P24-T17, SJ-223)

Probed on **22 September 2026** against the SATUSEHAT **staging** sandbox
(`api-satusehat-stg.dto.kemkes.go.id`), with the sandbox OAuth credentials in
`apps/api/.env` and the repeated-digit sandbox NIKs only (`9999999999999999`,
`0000000000000000`). Time-boxed to about an hour. No NIK, token or credential
appears in this file; the probe script masked every 16-digit number in what it
printed.

## Result

**No working request body could be established. The feature was not built.**

The published documentation now describes the body, but the gateway refuses
every plaintext form of it and asks for an encrypted message. Encrypting needs
the platform's KYC public key (`SATUSEHAT_KYC_SERVER_PUBLIC_KEY`), which this
deployment does not hold and which Kemenkes does not publish anywhere we can
reach (`docs/security/secrets.md`, "SATUSEHAT KYC keys"). This is the same
blocker P24-T16's end-to-end test has.

## What the documentation says now

The KYC REST page (`satusehat.kemkes.go.id/platform/docs/id/kyc/kyc-doc/rest-api-kyc/apis/api-kyc/`)
is reachable again (it redirected to the docs index on 2026-09-13). It
documents `POST /kyc/v1/challenge-code` as **unencrypted JSON**, which answers
the question left open at `docs/ops/satusehat-read-back-spike.md` §8:

```json
{
  "metadata": { "method": "request_per_nik" },
  "data": { "nik": "<NIK>", "name": "<name>" }
}
```

and a success answer of `data.nik`, `data.name`, `data.ihs_number`,
`data.challenge_code`, `data.created_timestamp`, `data.expired_timestamp`. The
same page documents `generate-url` as accepting either an armoured encrypted
body or plain JSON. It does not say where the server public key comes from.

## What the gateway answered

Token: `POST /oauth2/v1/accesstoken` → 200, token issued. Every call below
then went to `POST /kyc/v1/challenge-code` with that bearer token.

| Body sent                                                         | Content-Type       | Answer                                                                                                              |
| ----------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| The documented shape (`metadata.method` + `data.nik`/`data.name`) | `application/json` | HTTP 200, `{"metadata":{"code":"400","message":"Error: Bad Request"},"data":{"error":"Failed to decrypt message"}}` |
| The documented shape                                              | `text/plain`       | Same `Failed to decrypt message`                                                                                    |
| Flat `{ "nik", "name" }` (the P21-T07 attempt)                    | `application/json` | Same `Failed to decrypt message`                                                                                    |
| `{}`                                                              | `application/json` | Same `Failed to decrypt message`                                                                                    |
| An armoured `-----BEGIN ENCRYPTED MESSAGE-----` block with junk   | `text/plain`       | **HTTP 500**, plain text `A panic occurred during user function execution.`                                         |

So the staging service decrypts **before** it looks at the JSON at all,
whatever the documentation says about this endpoint being unencrypted; the
armour is recognised (a junk block gets past the tag check and crashes the
decrypt), and nothing distinguishes a wrong shape from a missing encryption.
The documented body is therefore the best available guess for the plaintext
**inside** the encrypted message, but it is unverified. The HTTP 500 on junk
also means a client must not treat 5xx on this endpoint as a transient outage
worth retrying; `SatusehatKycClient` already never retries.

## What was not tried, and why

- **A community-posted platform key.** `ssecd/ihs` issue #2 links two PEM
  files, a "production" and a "dev" key, posted by a third party in January
  2024, not by Kemenkes; the same thread says KYC only works in production.
  Downloading a key from an unofficial source and sending a (sandbox) NIK
  encrypted under it was out of bounds for this probe without the owner's say.
  It is the cheapest next step if the owner accepts it, and it would also
  unblock P24-T16's end-to-end test.
- **Production.** Never; the probe is sandbox-only by rule.

## Recommendation

Keep P24-T17 open and blocked on the same item as P24-T16's end-to-end test:
**obtain `SATUSEHAT_KYC_SERVER_PUBLIC_KEY` for staging** through the facility's
SATUSEHAT registration channel (owner still unknown, `docs/security/secrets.md`),
or accept the community-posted dev key for a sandbox-only probe. Once a key is
in `.env`, re-run the documented body through `encryptSatusehatKycMessage`;
if the answer carries `challenge_code`, the ticket is the 3 points it is
estimated at: one client method beside `generateValidationUrl`, the alternative
path in the P24-T16 dialog under `satusehat.kyc.verify:any`, the
`SATUSEHAT_KYC_STARTED` audit plus a D-033 reveal audit for the decrypted NIK,
and no NIK in any log or audit row.
