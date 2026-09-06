# Phase 16 pilot enablement (P16-T21 §4)

The gate between "merged" and "enabled for a clinic". Five epics shipped new
attack surface — clinic-authored HTML into a PDF renderer, a widened upload
allowlist, tokenised public bill links, four RBAC key families and five
entitlements. This is what has to be true before any of it is switched on for
a real clinic, and how to switch it back off.

Companion reviews:
[sanitiser](../security/document-html-sanitiser.md) ·
[renderer isolation](../security/renderer-isolation.md) ·
[RBAC matrix](../security/phase-16-rbac-matrix.md).

## 1. The five switches

| Key | Epic | Controllers it silences |
| --- | --- | --- |
| `invoice-documents` | E1 | `DocumentTemplateController`, `DocumentTemplateVariableController`, `InvoiceDocumentController` |
| `patient-documents` | E2 | `PatientDocumentController`, `PatientDocumentDetailController`, `EncounterDocumentController`, `PortalDocumentController` |
| `doctor-credentials` | E3 | `VaultDocumentController`, `VaultDocumentShareController`, `VaultShareRecipientController`, `SharedWithMeDocumentController` |
| `invoice-delivery` | E4 | `InvoiceDeliveryController`, `DeliveryActionController`, `PatientDeliveryConsentController` |
| `document-approval` | E5 | `DocumentApprovalController` |

Asserted by `feature-guard-coverage.spec.ts`, which is a controller list
rather than a route list: a route added to a gated controller tomorrow is
gated whether or not anyone remembers to say so.

**A disabled feature overrides every role grant.** A `SUPER_ADMIN` gets the
same `FEATURE_DISABLED` as anybody else.

The guards run `JwtAuthGuard` → `PermissionsGuard` → `FeatureGuard`, in that
order and deliberately: someone without the role grant is refused *before* the
entitlement is read, so probing routes cannot tell a signed-in user which
modules this clinic bought. The consequence for an operator is that a
`403 FORBIDDEN` and a `FEATURE_DISABLED` mean different things — the second
one means the caller would otherwise have been allowed.

### Three deliberate absences

**`ManagedDocumentController` and `DocumentTypeController` are ungated.**
Switching `document-approval` off takes away the second signature and leaves
the registry listing, searching, exporting and issuing directly (US-E5-06,
FR-E5-12). A clinic small enough that one person writes and issues everything
is not served by a queue that always names them.

**`DeliveryLinkPublicController` is ungated.** A patient holding a link the
clinic already sent must not lose the bill because the clinic stopped
*sending* new ones. Withdrawing outstanding links is a second, deliberate step
— revoking them — and folding it into the entitlement would make a rollback
silently wider than the operator asked for. The token is still checked,
rate-limited and revocable.

**`document-management` keeps only the corpus and the personal knowledge
bases.** P16-T21 split the epics out from under it because a clinic buys a
patient's clinical file and a doctor's credential drawer separately from a
chatbot corpus.

### The one dependency

`invoice-delivery` **cannot be enabled while `invoice-documents` is off**.
There is nothing to deliver without the PDF, and the failure would otherwise
surface as a broken message to a patient rather than as a refused toggle to an
operator. Enforced in `FeatureEntitlementService`; `422
FEATURE_PREREQUISITE_DISABLED`.

Disabling never cascades. Turning `invoice-documents` off leaves
`invoice-delivery`'s own row alone — a rollback that switched off a second
feature would be wider than asked for, and the dependent feature's guard
refuses its routes regardless.

### Defaults

All five seed **on**, like every other entitlement row. Enabling by default is
what keeps adding a key a packaging change rather than an outage: a clinic
already using patient documents must not lose them to a deploy that merely
gave the feature a switch. A key with no row also reads as enabled, so a
release that lands before its seed row does not black anything out.

**The pilot turns them off deliberately**, then on one at a time — see §4.

### Approval is off inside the switch, too

`document-approval` being on changes nothing on its own. Every document type
seeds with the approval policy the clinic chooses, and the two types this
phase wired behaviours for ship as:

| Type | `is_approval_required` |
| --- | --- |
| `INVOICE_TEMPLATE` | **FALSE** — publishing is one click, exactly as E1 specifies |
| `CLINIC_CORPUS_DOCUMENT` | TRUE |
| `AGREEMENT_*`, `CONSENT_FORM`, `CLINIC_POLICY_SOP`, `LETTER` | TRUE |
| `PATIENT_BILL`, `OTHER` | FALSE |

And enabling a policy gates **future** issues only (OQ-18): a corpus document
ingested before the switch stays retrievable, and only an explicit
"send for review" puts it behind the gate.

## 2. Findings register

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| F-1 | No production deployment manifest carries the D-026 renderer posture | **Blocking for pilot** | Open — infra |
| F-2 | Signed-URL minting is not rate-limited per user (NFR-SEC-05) | Medium | Open — security backlog |
| F-3 | The WhatsApp bridge image floats on `:latest` | Medium | Open — security backlog |
| F-4 | `D-028` was assigned twice: the delivery table (P16-T25) and, in a code comment, drafter-names-approvers | Low | **Fixed here** — the approval decision is D-029 |

Sanitiser pass: **no findings** (47 vectors, all neutralised).
RBAC pass: **no findings** (matrix asserted, vault `:any` absent, separation
of duties intact, no new role).

## 3. Dashboards, before enablement

§10 requires these live *first*, so the pilot is watched rather than reported
on afterwards.

| NFR | Signal | Source |
| --- | --- | --- |
| NFR-OBS-01 | PDF render failure rate; upload rejection rate | API structured logs — renderer adapter errors, `UploadedDocumentGuardService` rejections |
| NFR-OBS-02 | Delivery outcome mix (sent / failed / retried), WhatsApp session health, opt-out count | `document_deliveries` status counts; bridge `/app/devices` health; opt-out rows |
| NFR-OBS-03 | Approval queue depth, oldest-pending age, count of types with self-approval on | `document_approval_requests` where `status = 'PENDING'`; `document_types` where `allow_self_approval` |

**NFR-OBS-03's metrics are queries, not exported metrics.** The repository has
no metrics exporter to hang counters off, so these are dashboard queries
against the database for the pilot. That was the deliberate call at P16-T30
and it stands: a pilot is one clinic for one week, and a query answers the
question. An exporter is post-pilot work.

## 4. The pilot

**One clinic, one week.** Start with all five switches **off**, then:

1. **Day 0** — dashboards live (§3). F-1 closed. Confirm all five off: no
   Phase-16 surface is reachable by any role.
2. **Day 1** — enable `invoice-documents`. Publish one template, download one
   invoice PDF. Watch render failure rate.
3. **Day 2** — enable `patient-documents` and `doctor-credentials`. Upload a
   scan, release one document to the portal, file one credential.
4. **Day 3** — enable `document-approval`. Leave every type's policy as
   seeded; switch approval on for **one** type the clinic chooses and watch
   queue depth and oldest-pending age.
5. **Day 4** — enable `invoice-delivery`, **stricter than the rest**:
   - **staff-triggered sends only** — auto-send stays off,
   - a **low daily cap**,
   - one full week watching WhatsApp session health and the opt-out count
     before the cap is raised.

Raise the delivery cap only after a week of clean session health. A bridge
that dropped its pairing mid-week is a re-pair, not a retry (§8.4).

### Go / no-go

Do not enable if any of these is true:

- F-1 is open — the production manifest does not carry the renderer posture.
- The dashboards in §3 are not answering.
- `pnpm test` is not green on the release commit, in particular the sanitiser
  corpus, the RBAC matrix and the renderer posture specs.
- The clinic has not been told, in the privacy notice, that documents may be
  sent over WhatsApp.

## 5. Rollback (§10.6)

**Disabling an entitlement hides every surface, with no migration.** That is
the property the whole design buys: the switch is a row, the guard reads it
within one cache TTL (and the write path invalidates immediately), and nothing
in the database changes.

| Step | Effect | Reversible |
| --- | --- | --- |
| Disable `invoice-delivery` | No new sends. Outstanding links keep working. | Yes, instantly |
| **Then**, deliberately: revoke outstanding links | Existing links 404. Patients must be re-sent. | No — a revoked link stays revoked |
| Disable `patient-documents` / `doctor-credentials` / `invoice-documents` | Surfaces gone; files untouched in the bucket | Yes, instantly |
| Disable `document-approval` | Approval queue and controls gone; registry keeps listing, searching, exporting and issuing. Any pending round returns to `DRAFT`. | Yes, instantly |
| Remove the renderer sidecar | PDF requests fail closed with a clear error; billing keeps working | Yes |

The two-step delivery rollback is the important one and it is two steps on
purpose: stopping the sends and withdrawing what was already sent are
different decisions with different consequences for a patient holding a
receipt.

## 6. Runbook additions

### Renderer sidecar

- Bring up: `docker compose -f infra/docker/docker-compose.dev.yml --profile pdf up -d gotenberg`
- Health: `GET /health` on the container, from inside the compose network only
  — there is no published port, by design.
- Chromium launches lazily on the first conversion, so `/health` answering
  fast does not mean a render is warm. First render is ~600 ms cold, ~75 ms
  warm (D-026).
- Six concurrent renders is Chromium's own ceiling; past it Gotenberg queues
  rather than degrading. A burst of cashiers hitting *Download* waits, it does
  not fail.
- Verification commands: [`renderer-isolation.md`](../security/renderer-isolation.md#re-verification-per-environment).

### Delivery worker

- Claims deliveries by lease; a crashed worker's rows return after the lease
  expires rather than being stuck.
- WhatsApp session health is the first thing to check on a run of failures —
  a dropped pairing fails every send identically.
- Never retry by re-issuing from a delivered file. The clinic re-issues from
  its own unlocked object in storage (D-027).

### Approval scheduler

- Sweeps pending rounds with a deadline and claims each notice conditionally,
  so a second tick — or a second process — sends nothing (FR-E5-27).
- **A deadline decides nothing** (FR-E5-28). A queue that has gone quiet is a
  people problem, not a stuck job; the rows are still `PENDING` and still
  actionable.
- Queue depth climbing with a flat decision rate is the R-15 bottleneck. The
  escape hatches, in order: withdraw (always available to the drafter), name a
  different approver, or switch the type's policy off.
