# Phase 16 RBAC matrix (P16-T21 §3)

Five epics added four new permission families and one decide key. This is the
phase-level answer to "which role can do what across documents", written once
so nobody has to reconstruct it from five tickets.

**The matrix is asserted, not merely described.**
`apps/api/src/common/authorization/phase-16-rbac-matrix.spec.ts` reads
`seed.sql` and fails if a binding here stops being true — including the
absences, which is where a widening actually shows up. When this table
changes, that spec changes with it.

Reviewed against `seed.sql` at P16-T21. Roles are the seeded ones:
`SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`, `PHARMACIST`. `SUPER_ADMIN` holds
every key by wildcard and is omitted from every row below; a blank cell means
**denied**, and deny-by-default is the rule the guard applies to anything not
listed.

## The matrix

| Key | Scope | ADMIN | DOCTOR | PATIENT | PHARMACIST |
| --- | --- | --- | --- | --- | --- |
| **E1 — Invoice documents** |
| `document-template.read:any` | ANY | ✅ | | | |
| `document-template.write:any` | ANY | ✅ | | | |
| **E2 — Patient documents** |
| `patient-document.read:any` | ANY | ✅ | | | |
| `patient-document.read:own` | OWN | | ✅ | ✅ | |
| `patient-document.write:any` | ANY | ✅ | | | |
| `patient-document.write:own` | OWN | | ✅ | | |
| `patient-document.delete:any` | ANY | ✅ | | | |
| `patient-document.release:own` | OWN | | ✅ | | |
| **E3 — Doctor vault** |
| `vault-document.read:own` | OWN | ✅ | ✅ | | |
| `vault-document.write:own` | OWN | ✅ | ✅ | | |
| `vault-document.delete:own` | OWN | ✅ | ✅ | | |
| `vault-document.share:own` | OWN | ✅ | ✅ | | |
| **E4 — Delivery** |
| `invoice.deliver:any` | ANY | ✅ | | | |
| **E5 — Documents module** |
| `managed-document.read:any` | ANY | ✅ | | | |
| `managed-document.write:any` | ANY | ✅ | | | |
| `document-type.write:any` | ANY | ✅ | | | |
| `document-approval.decide:any` | ANY | ✅ | | | |

## What each scope actually means

`OWN` is resolved by the ability factory and the repository, never by a
controller, and it means a different thing per family — which is why the scope
column alone is not the whole answer:

- **`patient-document.*:own` for a DOCTOR** — files belonging to patients the
  doctor attends, resolved through the assignment and encounter tables. Not
  "files the doctor uploaded".
- **`patient-document.read:own` for a PATIENT** — their own file, and only the
  documents a doctor has *released* to the portal. A clinical file exists
  before it is releasable; the release flag is a second condition, not a
  synonym for ownership.
- **`vault-document.*:own`** — the caller's own drawer. `ADMIN` holds these at
  OWN like anybody else, which is the point of the next section.

## Four properties this phase depends on

### 1. The vault has no `:any` key — and none exists to be granted

`vault-document.read:any` and its siblings are not ungranted permissions.
**There is no such permission row**, so no role screen, no future migration
and no administrator can create the grant. A doctor's KTP, contracts and
licences have exactly one non-owner reader: a live share the owner created
(`PersonalDocumentShare`, P16-T34), which the owner can revoke.

An `ADMIN` therefore cannot browse a vault. That is deliberate and it is the
one place in this product where an administrator is *less* privileged than
their job title suggests.

Asserted by `vault-document-rbac-seed.spec.ts` and re-asserted at phase level.

### 2. Deciding is not writing

`managed-document.write:any` drafts and edits. `document-approval.decide:any`
signs off. `document-type.write:any` defines what a type is and whether it
needs approval at all. Three keys, three rows, and a deployment can hand out
any one without the others.

**Holding `decide` is still not sufficient.** A decision needs the caller to
be *named on the round* as well (FR-E5-13), which is a per-round fact no grant
can substitute for, checked in `DocumentApprovalService` and covered by its
own spec. The inverse also holds: being named grants nothing on its own.

### 3. No new role was seeded (OQ-1)

The phase introduces no `RECORDS_OFFICER`, no `APPROVER`, no
`DOCUMENT_ADMIN`. Approval routing is per-document and per-round — the drafter
names who signs (D-029) — so a role would have been a second, weaker copy of
the panel. Asserted.

### 4. Registry reads are filtered per row, not per grant

`managed-document.read:any` is permission to use the registry, not permission
to see everything in it. `ManagedDocumentRepository` folds a per-row source
rule into every query (FR-E5-04):

- Vault-subject rows: owner only, whatever else the caller holds.
- `PATIENT_BILL` rows: behind `invoice.read:any`.
- Clinic-corpus rows: behind the corpus read grant.

A row outside the caller's reach is absent from the list, absent from the
count, and a 404 on the detail — never a 403 that confirms it exists. Covered
by `managed-document.database.spec.ts`.

## Service-level enforcement, not UI

Three refusals in this phase are enforced in services and would hold against a
client that skipped every dialog the web app draws (NFR-SEC-09):

| Refusal | Where | Code |
| --- | --- | --- |
| Publishing a template while its type requires approval | `DocumentTemplateApprovalService.assertPublishAllowed` | `409 DOCUMENT_TEMPLATE_APPROVAL_REQUIRED` |
| Re-ingesting a corpus document that is not approved | `ClinicCorpusApprovalService.assertIngestAllowed` | `409 CLINIC_CORPUS_APPROVAL_REQUIRED` |
| A drafter approving their own document | `DocumentApprovalService` | `403 DOCUMENT_SELF_APPROVAL_FORBIDDEN` |

All three read the same `DocumentType` policy row the UI reads, so the two can
disagree about what to *draw* but never about what is *allowed*.

## Entitlements sit in front of all of it

A disabled feature overrides every role grant — but the guards run
**`PermissionsGuard` first, `FeatureGuard` second**, and that order is
load-bearing. A caller without the grant is refused before the entitlement is
ever consulted, so a signed-in user cannot learn which modules the clinic
bought by probing routes they were never allowed to call. A caller *with* the
grant then meets `FEATURE_DISABLED`. See
[`phase-16-pilot-enablement.md`](../ops/phase-16-pilot-enablement.md) for which
key gates which controller and what happens when they are all off.

Entitlements are commercial packaging, **not** the security boundary. A key
with no row reads as enabled, deliberately, so that a release which adds a key
before its seed row lands does not black out a feature the clinic is paying
for. The permission guard still stands in front of every route.
