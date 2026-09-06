# Renderer isolation: verification (P16-T21 §2)

The PDF renderer is the largest untrusted-input parser this product holds. It
takes clinic-authored HTML and runs Chromium over it. D-026 decided the
posture; this is the record of verifying that the posture is actually in the
artefacts, and of the one place where it is not yet.

Applies to NFR-SEC-03, with spot checks on NFR-SEC-04, -05, -07 and -08.

## The posture has two halves, and both are checked in CI

`apps/api/src/common/pdf/renderer-isolation.spec.ts` reads
`infra/docker/docker-compose.dev.yml` and fails if either half is dropped.
D-026 proved outbound denial by measuring a running container during the
P16-T01 spike; that proof is about a container that existed then. The spec is
about the file that brings one up tomorrow, because both halves are single
lines and a single line is what gets lost in a merge.

### Half one — no route off the network

| Property | Where | Verified |
| --- | --- | --- |
| `renderer` network is `internal: true` — Docker attaches no gateway | `docker-compose.dev.yml` `networks:` | ✅ spec |
| The renderer joins that network and no other | `gotenberg.networks` | ✅ spec |
| No published port | `gotenberg` has no `ports:` | ✅ spec |

`internal: true` is the half that makes NFR-SEC-03 true rather than
aspirational. A container on that network alone cannot reach the host, the
LAN or the internet at all — so a template that somehow retained a remote
reference fetches nothing because there is nowhere to fetch from, not because
Chromium chose not to.

### Half two — Chromium refuses to fetch

| Flag | Why |
| --- | --- |
| `--chromium-deny-private-ips` | SSRF into the compose network and the host's LAN |
| `--chromium-deny-public-ips` | Exfiltration and remote-asset loading |
| `--chromium-clear-cache` / `-cookies` / `-storage` | No state carried between one clinic's document and the next |
| `--libreoffice-disable-routes` | A full office suite reachable over HTTP that nothing here uses |
| `--pdfengines-disable-routes` | Same, for the PDF-engine routes |

All ✅ by spec.

### Nothing to steal if it is compromised

The renderer service has **no `environment:` block at all** — no
`DATABASE_URL`, no `S3_*` credentials, no JWT secrets, no encryption keys.
Asserted per-secret by the spec. This is the property that makes the sidecar
worth its 2.45 GB: a Chromium bug lands in a container holding nothing.

### Pinned, not floating

`gotenberg/gotenberg:8.36.0`. The browser engine on the untrusted-input path
does not change under a restart nobody reviewed. Asserted by the spec.

## Self-contained input

Template HTML reaches the renderer with no remote references to resolve:

- The sanitiser bans parentheses in CSS values, which removes `url(…)`
  entirely — see [`document-html-sanitiser.md`](document-html-sanitiser.md).
- `<img>` may carry only a `data:image/*` source; every other `src` is dropped
  at write time, so a remote reference is never even stored.
- `buildInvoiceDocumentHtml` composes the document; there is no author
  stylesheet and no external font to fetch.

So the network denial is defence in depth over content that has nothing to
fetch, rather than the only thing standing between the renderer and a remote
server.

## Adjacent NFR spot checks

| NFR | Claim | Result |
| --- | --- | --- |
| NFR-SEC-04 | Every download URL carries `Content-Disposition: attachment` and a pinned `Content-Type` | ✅ 14 call sites sign both as response-header overrides, so the storage origin serves the file as an attachment under its validated stored type. A download can never render inline on the bucket origin. |
| NFR-SEC-05 | Upload/download URL minting is rate-limited per user | ❌ **Finding F-2** — see below |
| NFR-SEC-07 | PDF bytes are streamed server-side; bucket URLs never ride in a WhatsApp message or email body | ✅ Attachment delivery reads the object server-side and sends bytes (`DeliverySendService`). Link delivery sends a **tokenised app URL** (`/delivery-links/:token`), never a presigned bucket URL — the presign is minted inside `DeliveryLinkService` when the token is redeemed and never leaves the response. |
| NFR-SEC-08 | GOWA/SMTP secrets never logged; the bridge is unpublished | ✅ for both, with **Finding F-3** on the bridge image tag. The bridge has no `ports:`, basic auth is on, and the webhook never leaves the compose network. Secrets go through `buildSafeErrorLog`. |

## Failure shape: the renderer is removable

§10.6 requires that the renderer can be taken out independently and that
invoicing keeps working. It can, and the failure is **closed and legible**:
`PdfRendererService` is an abstract port with a Gotenberg adapter, and with
`PDF_RENDERER_BASE_URL` unset or the sidecar down, a PDF request fails with
the adapter's service error for that one request. Invoices, tariffs, payments
and the ledger are untouched — they never call the renderer.

## Findings

### F-1 — No production deployment manifest carries this posture · **blocking for pilot**

`docker-compose.dev.yml` is the only manifest in the repository, and it is the
one this review verified. There is no production compose file, no Kubernetes
manifest and therefore **no NetworkPolicy** — production images are already a
tracked gap in
[`deployment-runbook.md` §7](../ops/deployment-runbook.md).

The posture is correct in the artefact that exists. What cannot be asserted is
that the artefact which eventually deploys to a clinic carries it, because
that artefact has not been written.

**Gate:** a Phase-16 pilot must not be enabled until the production manifest
exists and reproduces both halves — for Kubernetes, a `NetworkPolicy` denying
all egress from the renderer pod *plus* the Chromium flags; for Compose, the
`internal: true` network *plus* the flags. Extend
`renderer-isolation.spec.ts` to read that manifest too when it lands.

**Owner:** deployment/infra, before pilot enablement.

### F-2 — Upload and download URL minting is not rate-limited · **medium**

NFR-SEC-05 asks for a per-user rate limit on signed-URL minting. The
application has no global throttler; the only limits in force are the login
throttle, the conversation limits and the public delivery link's own two
in-memory counters.

An authenticated user holding a document write grant can therefore mint signed
URLs as fast as they can call the endpoint. The consequence is bounded — the
URLs are short-lived, scoped to a server-minted key, and every one of them is
already reachable to that caller through the ordinary route — so this is
resource abuse and enumeration cost, not a confidentiality break.

**Recommendation:** a `ThrottlerGuard` with a per-user bucket on the
`*/upload-url` and `*/download` routes. Not fixed in this ticket: it wants a
throttler decision that applies to the whole API rather than a bespoke counter
on five endpoints.

**Owner:** filed for the security backlog.

### F-3 — The WhatsApp bridge image floats on `:latest` · **medium**

`aldinokemal2104/go-whatsapp-web-multidevice:latest`. Whoever reaches that
container can send as the clinic, and its version changes on any `docker
compose pull` with no review. The renderer next to it is pinned to an exact
version for exactly this reason.

**Recommendation:** pin to a digest or an exact tag, and treat a bump as a
reviewed change. Not fixed here because it needs the version currently paired
against the clinic's number to be confirmed first — repinning to the wrong tag
is a re-pair, and a re-pair is a QR scan against a live number (§8.4).

**Owner:** filed for the security backlog.

## Re-verification, per environment

The structural checks run in CI. The live check is per environment and belongs
in the deploy verification step:

```bash
# From inside the renderer container: every one of these must fail.
docker compose -f infra/docker/docker-compose.dev.yml --profile pdf \
  exec gotenberg sh -c 'wget -T 3 -qO- https://example.com; echo "exit=$?"'

# The renderer holds no credentials.
docker compose -f infra/docker/docker-compose.dev.yml --profile pdf \
  exec gotenberg env | grep -Ei 'database|s3_|jwt|key' || echo 'none — expected'

# It is not reachable from the host.
curl -sS --max-time 3 http://localhost:3000/health || echo 'unreachable — expected'
```

A non-empty result from the second command, or a successful fetch from the
first, is a stop-the-pilot finding.
