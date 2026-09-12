# Architectural Decision Record (MVP)

## D-001: Monorepo with pnpm Workspace

- **Status:** Accepted
- **Decision:** Use a pnpm workspace monorepo for API, web, and shared packages.
- **Why:** Consistent dependency management, simple local development, and easy shared contract reuse.
- **Consequence:** All tooling/scripts must support workspace-aware execution.

## D-002: Modular Monolith for Backend

- **Status:** Accepted
- **Decision:** Build NestJS backend as modular monolith with strict module boundaries.
- **Why:** Faster MVP delivery than microservices while preserving future service extraction path.
- **Consequence:** Cross-module communication must go via application interfaces.

## D-003: Clean Architecture in API Modules

- **Status:** Accepted
- **Decision:** Enforce a strict 3-layer backend module contract: `repository`, `service`, and `controller`.
- **Why:** Keeps data access, business logic, and API transport concerns separated while staying simple for MVP velocity.
- **Consequence:** Controllers stay thin, repositories remain query-focused, and services own orchestration/transactions.

## D-004: Frontend Data/Form Stack

- **Status:** Accepted
- **Decision:** Use TanStack Query for API integration and caching; use @tanstack/react-form + Zod for forms and validation.
- **Why:** Strong type safety, predictable async state, and composable validation model.
- **Consequence:** Feature code should standardize query keys, mutation hooks, and schema-driven forms.

## D-005: Auth and RBAC Model

- **Status:** Accepted
- **Decision:** JWT authentication with IAM-style RBAC (`resource.action:scope`) where admins can assign/unassign roles per user, implemented with CASL on backend and frontend.
- **Why:** Fine-grained authorization and ownership checks required for healthcare workflows.
- **Consequence:** Deny-by-default policy, CASL-based guard/policy enforcement in backend, CASL-based capability checks in frontend UX, and auditable role binding history (`assignedBy`, `unassignedBy`, timestamps).

## D-006: Database and ORM

- **Status:** Accepted
- **Decision:** PostgreSQL with Prisma ORM latest stable (currently v7.8.0) and migration-first schema lifecycle.
- **Why:** Relational consistency, mature tooling, and clear migration history.
- **Consequence:** Every schema change ships with reviewed migration and CI validation; backend adopts Prisma v7 adapter-based client setup and explicit client generation path.

## D-007: AI Chatbot Scope Limitation (Post-MVP)

- **Status:** Accepted
- **Decision:** Defer AI chatbot to post-MVP Phase 13 (after SATUSEHAT integration). When delivered, limit to FAQ/guidance/research support, exclude diagnosis, and integrate only through an existing external production AI service.
- **Why:** Indonesian clinic buyers prioritize compliance (RME, SATUSEHAT, BPJS) over conversational AI; SATUSEHAT linkage also enables safer read-only context enrichment.
- **Consequence:** Mandatory disclaimers, audit logs, abuse protections, provider adapter resilience (timeout/retry/circuit-breaker), and no local model-serving implementation. Full spec: [docs/post-mvp/ai-chatbot.md](../post-mvp/ai-chatbot.md).

## D-008: CI Quality Gate Order

- **Status:** Accepted
- **Decision:** CI must run install -> lint -> typecheck -> unit -> integration -> build.
- **Why:** Fast failure and deterministic quality enforcement.
- **Consequence:** PRs must meet all checks including migration validation and Docker build success.

## D-009: Backend 3-Layer Module Contract

- **Status:** Accepted
- **Decision:** Every backend module must implement `repository` (ORM/query), `service` (business process), and `controller` (API exposure) layers.
- **Why:** Keeps data access, business logic, and transport concerns separated and predictable across teams/agents.
- **Consequence:** Controllers never access Prisma directly; services orchestrate repositories; repository layer stays logic-light.

## D-010: Frontend UI and Styling Stack

- **Status:** Accepted
- **Decision:** Frontend uses Tailwind CSS latest stable (currently v4.3.2) and shadcn/ui latest CLI (currently v4.13.0) with monorepo mode.
- **Why:** Fast, consistent UI delivery with reusable components and workspace-aware component distribution.
- **Consequence:** Maintain `components.json` in `apps/web` and `packages/ui`, enforce consistent aliases/style tokens, and add components through shadcn CLI monorepo commands.

## D-011: Shared Validation Contract Package

- **Status:** Accepted
- **Decision:** Keep reusable request validation schemas in `packages/shared-types` as Zod schemas and consume them in backend DTO wrappers via `createZodDto(...)`.
- **Why:** Prevent API/frontend validation drift and keep contract types shared from one source.
- **Consequence:** Backend DTO classes import shared schemas, frontend forms reuse the same schemas when contracts overlap, and schema changes are treated as contract changes requiring docs/tests review.

## D-012: Global Authorization Guard Wiring

- **Status:** Accepted
- **Decision:** Register `JwtAuthGuard` and `PermissionsGuard` globally via `APP_GUARD` in a shared authorization module; keep `Auth(...)` decorator metadata-only.
- **Why:** Avoid repetitive per-module guard provider wiring and reduce Nest DI scoping issues when using shared auth decorators.
- **Consequence:** Feature modules use `@Auth(...)` without local guard registration; authorization behavior is consistent across modules.

## D-013: Runtime Configuration Access via ConfigService

- **Status:** Accepted
- **Decision:** Use Nest `ConfigService` for runtime env access in providers/services (e.g., Prisma and auth flows) instead of direct `process.env` reads.
- **Why:** Centralizes configuration handling and aligns with backend convention for validated configuration.
- **Consequence:** `ConfigModule` remains global, runtime-dependent classes inject `ConfigService`, and env access patterns stay consistent.

## D-014: SSR-First App Router and OpenAPI Codegen Integration

- **Status:** Accepted
- **Decision:** Keep Next.js App Router route files (`layout.tsx`, `page.tsx`) server-rendered by default, isolate interactive logic in `components/client/*`, and generate frontend API hooks from backend OpenAPI YAML using Orval (`react-query`).
- **Why:** Improves rendering consistency, keeps server/client boundaries explicit, and prevents frontend/backend contract drift.
- **Consequence:** Backend must expose stable OpenAPI YAML (`/api/openapi.yaml`), frontend regeneration via Orval becomes part of integration workflow, and UI capability checks stay in client components only.

## D-015: Frontend Authorization Boundary and HTTP Interceptor Strategy

- **Status:** Accepted
- **Decision:** Evaluate access at server boundary (Next page/layout + `proxy.ts`) and keep a single CASL provider at route/layout or feature-root parent. Use centralized axios client/interceptor for frontend HTTP auth header injection and 401 handling.
- **Why:** Prevent scattered authorization logic, keep server/client auth boundaries explicit, and avoid duplicated per-feature HTTP auth setup.
- **Consequence:** Leaf components must consume shared `Can`/ability hooks only; no local provider definitions in leaf UI. Server boundary must derive and check abilities before render and pass serializable rules to the client provider.

## D-016: Backend-First Clinical Delivery Gate

- **Status:** Accepted
- **Decision:** Deliver all MVP clinical modules backend-first and defer clinical frontend integration until backend readiness gate completion.
- **Why:** Prevents frontend/backend contract churn, keeps RBAC/policy enforcement complete before UI exposure, and stabilizes API handoff quality.
- **Consequence:** Phase sequencing requires backend completion for admin/patient/doctor/appointment/registration/pharmacy modules, verified OpenAPI contracts, and passing backend validation pipeline before starting corresponding frontend implementation.

## D-017: Explicit Doctor-Patient Assignment

- **Status:** Accepted
- **Decision:** Model the many-to-many care relationship with an explicit `DoctorPatient` junction and append-only `DoctorPatientActivity` events. Retain every assignment lifecycle and do not infer durable assignments from appointments, registrations, or prescriptions.
- **Why:** A patient can have multiple doctors and a doctor can have multiple patients independently of individual encounters; explicit assignment also supports reliable ownership authorization.
- **Consequence:** Patient and doctor create services may atomically create initial assignments and activity events, relation mutations are explicit and audited, reassignment creates a new lifecycle record, authorized admins can query a filterable activity log, list responses use bounded summaries/counts, detail queries use explicit projections, and doctor `patient.read:own` checks require an active assignment.

## D-018: Provider-Neutral Object Storage with S3 Adapter

- **Status:** Accepted
- **Decision:** Define and export a typed object-storage provider in the NestJS common layer, with S3 as its infrastructure adapter. Domain modules inject this provider when their workflows need file storage.
- **Why:** Keeps AWS SDK concerns out of feature services, supports test doubles and S3-compatible environments, and avoids creating a generic storage API that bypasses domain authorization and lifecycle rules.
- **Consequence:** The provider offers upload, get, signed-URL, signed-upload-URL, head, and idempotent delete operations; `ConfigService` supplies validated runtime configuration; each owning module defines its own file endpoints and persists object keys only; every S3-backed URL returned by an API is short-lived and signed, and signed URLs are never persisted.
- **Amendment (browser-direct uploads):** `getSignedUploadUrl` lets a client PUT straight to the bucket so large files never proxy through the API. The server never sees those bytes, so the checks `uploadObject` performs after the fact have to happen *before* signing and be bound into the signature: the declared content type is validated against the MIME allowlist and passed to the presigner as a **signable header** (the AWS SDK does not sign `content-type` by default, which would leave the allowlist advisory), and the declared size is validated and signed as `ContentLength`. The key must be one `generateObjectKey` minted — a presigned PUT is direct write authority over exactly that key, so a caller-supplied key would let a client overwrite another object. An upload is **not** a fact until `headObject` confirms it: the owning module signs, the client PUTs, the module HEADs and only then writes the row, persisting the object key and never the URL. Presigning uses a dedicated S3 client configured with `requestChecksumCalculation: 'WHEN_REQUIRED'`, because the SDK default signs a CRC32 of the empty presign body into the URL and the provider then rejects the real upload.

## D-019: Clinic Timezone Convention

- **Status:** Accepted
- **Decision:** Doctor schedule windows and appointment sessions are wall-clock values in a single configurable clinic timezone (`CLINIC_TIMEZONE` env, default `Asia/Jakarta`). The API converts UTC instants into that zone (via shared helpers `isWithinDoctorAvailability`/`buildZonedDateTime` in `@hms/shared-types`) before any schedule validation.
- **Why:** Availability was previously compared against UTC clock time, rejecting valid clinic-local slots (e.g. Monday 09:00 WIB arriving as 02:00Z against an 08:00–12:00 window).
- **Consequence:** All new schedule/session date-time logic must go through the shared timezone helpers; the browser is assumed to run in the clinic timezone for wall-clock inputs.

## D-020: Session-Based Appointment Scheduling

- **Status:** Accepted (full design: [docs/revamp/appointment-scheduling.md](../revamp/appointment-scheduling.md))
- **Decision:** The default booking unit is a doctor practice **session** (a lazily materialized occurrence of a weekly schedule window, with limited `maxPatients` or unlimited capacity) that patients join without picking a time. Exact-time needs are `SPECIAL_REQUEST` appointments that require clinic approval (`REQUESTED → SCHEDULED/REJECTED`) unless created by an `appointment.approve` holder. Queue numbers are assigned at clinic check-in (first come, first served); a booking is only a participation record. Session booking closes 60 minutes before the window starts; patient-initiated special requests need 3 days' lead. The web calendar renders sessions with patient totals (overlapping cards in side-by-side columns) and a details modal with the check-in queue.
- **Why:** Consult duration inside the doctor's room is highly dynamic, so promising exact clock times misleads patients; the clinic's real workflow is arrival-order queues within practice windows.
- **Consequence:** `POST /appointments` is a discriminated union (`SESSION`/`SPECIAL_REQUEST`); capacity and queue assignment run under session row locks; session bookings cannot be rescheduled to timestamps (cancel and rebook); approval/rejection events are the future WhatsApp-chatbot notification hook (per D-007); a session waitlist is approved but deferred to a later phase.

## D-021: Backend Error Message Surfacing on the Web

- **Status:** Accepted
- **Decision:** All web mutation error paths resolve the backend message through a shared `resolveApiErrorMessage` (tolerating both the documented error envelope and Nest's default exception shape) and surface it via `notifyApiError`, which fires a top-right shadcn/sonner toast from `@hms/ui` in addition to any inline form alert.
- **Why:** Feature code previously showed generic fallbacks because the resolver only understood the envelope shape the API never emitted; users lost actionable messages such as capacity or availability rejections.
- **Consequence:** Features must not hand-write error text in catch blocks; a global Nest exception filter emitting the documented envelope remains an open conformance task (see api-contract.md).

## D-022: Stale JWT Permission Claims After Role Edits (Accepted Window)

- **Status:** Accepted
- **Decision:** Role and permission edits propagate to the frontend only when the access token is reissued — a staleness window bounded by `JWT_ACCESS_EXPIRES_IN` (15 minutes by default, 5 in the dev example env). The window is accepted, not worked around: no forced refresh, no push channel, no per-request claim revalidation on the web tier. The API is exempt from the window by construction — `PermissionsGuard` re-reads roles and permissions from the database on every request, so enforcement is live on the next request after any edit (proven by `rbac.integration.spec.ts`).
- **Why:** The permission claims are documented as advisory-only (`packages/shared-types/src/auth/types.ts`); everything that reads them — the CASL ability behind menus and buttons, `proxy.ts` shell gating, the session hint — is a navigation/visibility input, never authorization. (Since D-023 those claims are split across two cookies: `portal.*` in the access token, the rest packed into the session hint. Both are reissued together on every login and refresh, so the window described here is unchanged.) Both stale directions are benign: a user whose grants were revoked keeps seeing menus whose every call now 403s (and loses shell access at the next refresh); a user granted new permissions gains the menus at the next refresh, or immediately by signing out and in. Forcing an early refresh was evaluated and rejected: access tokens are bearer JWTs the server cannot recall, so it would take a token-version claim checked against the database per navigation (which `proxy.ts` must not do — it is edge-safe by rule, no API calls) or a push/poll channel, all to shorten a visibility-only lag that authorization does not share.
- **Consequence:** UI capability checks may lag role edits by up to one access-token lifetime; anything security-sensitive must be enforced server-side (already the standing rule). Keep `JWT_ACCESS_EXPIRES_IN` well under `SESSION_IDLE_TIMEOUT_MINUTES` (the boot check enforces the ratio), which also caps this window. The fallback presets in `app-ability.server.ts` remain strictly fallbacks for claims that map to no rule at all: whenever at least one claim maps to a rule, the claims win and no preset is consulted (covered by `app-ability.server.spec.ts`). There are two, and the split is load-bearing — `SUPER_ADMIN_PORTAL_RULES` grants `manage all`, mirroring the catalogue-wide grant `seed.sql` gives that role by construction, while `ADMIN_PORTAL_ADMIN_RULES` withholds the role lifecycle because the seed withholds it from `ADMIN` deliberately. Collapsing the two is what hid role management from `SUPER_ADMIN` (D-023). If clinics ever need faster UI convergence, the cheap lever is an eager token refresh on entering the admin surface — the refresh path already reissues claims from the database — not a revocation mechanism.

## D-023: Permissions Travel in the Session Hint, Not the Access Token

- **Status:** Accepted (supersedes the transport half of D-022; the staleness window it describes is unchanged)
- **Decision:** The access token carries only the `portal.*` permission family. The full permission set moves to the `hms_session_hint` cookie, packed by `packPermissionHint` (`@hms/shared-types`): grouped by resource so each resource name is written once, with the `:any` / `:own` scope suffix dropped, encoded as `resource:action,action;resource:action`. `resolveSessionClaims` unions the two sources. Both remain visibility-only inputs; `PermissionsGuard` still re-reads the database on every request.
- **Why:** The full set in the JWT did not fit in a cookie. A `SUPER_ADMIN` holds the whole catalogue through the seed's blanket grant — 127 keys, a 4212-byte token, 4229 bytes once `hms_access_token=` is counted, against the browser's 4096-byte per-cookie limit. `setAccessTokenCookie` writes through `document.cookie`, which discards an oversized write **silently**: no exception, no console warning. The failure was invisible in exactly the way that matters — pages rendered, API calls still succeeded (the token reached the axios mutator), and only the visibility gates degraded. With no token cookie the web tier fell back to the session hint, which carried `portal.*` only; those map to no CASL rule, so `resolveAppAbilityRules` returned a hardcoded role preset on *every* page load rather than only after expiry, and role management vanished from `/admin/administration` for the one role that actually holds `role.create:any`. The split follows what reads each cookie: `proxy.ts` gates the shell in the edge runtime where no API call is possible and must match `portal.*` exactly, scope included; everything else is rendering data, and the hint is the cookie that already exists to carry rendering data. Dropping the scope is lossless here because `permissionToRule` already discards it. Three alternatives were rejected. **Fetching permissions from `/auth/me`** is the orthodox answer and was the original plan, but seventeen server components resolve claims synchronously from cookies and `apps/web` has no server-side API fetch helper; it would mean rewriting all of them to async or moving ability resolution client-side and accepting a permission flash on every render. **Deflating the claim inside the JWT** fits (1549 bytes) and is a two-file change, but leaves ~3 KB of pure UI data inside a credential and makes the token unreadable in a debugger. **Leaving the set unpacked in the hint** measured 4041 bytes — under the cap, but with 55 bytes of headroom, which is not a margin.
- **Consequence:** Decoding must stay synchronous and free of Node builtins, because `proxy.ts` runs on the edge where `zlib` does not exist and the seventeen synchronous consumers would otherwise all have to change — this is why the encoding is three `split` calls rather than compression. The encoding's win comes from reusing resource names, so it scales with *actions per resource*, not with the number of distinct resources: two hundred permissions across two hundred distinct resources would not fit and no assertion would catch it. Two guards bound the risk from opposite ends — `apps/web/lib/auth/permission-hint-codec.spec.ts` measures the real `seed.sql` catalogue, and `session-hint-cookie.spec.ts` measures headroom for growth. A hint written before this change carries no `packedPermissions`; it still resolves the shell from `portal.*` and falls back to the role preset, so existing sessions degrade rather than break. Anything that needs a permission's scope on the web tier must read it from `portal.*` or from the API — the hint no longer carries it.

## D-024: Every Doctor Arrives by Invitation

- **Status:** Accepted (P20-T01; tightens the optional email P19-T15 introduced)
- **Decision:** `createDoctorSchema.email` is required. The address is collected at creation and owned by `User` — it is still not a `DoctorProfile` column. The create path makes one of three decisions before anything is written: an unknown address gets an invitation bound to the new profile (`UserInvitation.doctorProfileId`), an address that already has an account is attached and granted `DOCTOR`, and an address already linked to a doctor or holding a live invitation is refused. `ownerUserId` is no longer accepted on create. `updateDoctorSchema` is unchanged: it never takes an email (changing an address stays an Administration action on the account) and it keeps `ownerUserId` for re-linking by id through the API.
- **Why:** A doctor without an account is a doctor who cannot sign in, and while the email was optional nothing made the second half of the job happen. `ownerUserId` goes because an address already names the account: a known address attaches the same user an id would, so keeping both meant two ways to name one person and a refusal path whenever they disagreed. No client sent it — the web form never did.
- **Consequence — doctors who predate the rule:** there is nothing to backfill from; the address was never collected. They keep working exactly as before — list, detail, edit, schedule. `DoctorProfile.invitationStatus` gains a third value, `NO_ACCOUNT`, and is now always present: blank used to mean "no account", and once every new doctor has an address blank is not an honest state. The directory badges those doctors and offers **Send invitation**, which calls `POST /api/v1/doctors/:id/invitation` (`doctor.update:any`) and makes the same invite-or-attach decision as create. The same action is the recovery for an invitation that lapsed or was withdrawn. It refuses with 409 when the doctor already has an account (`DOCTOR_ACCOUNT_ALREADY_LINKED`) or a live invitation (`DOCTOR_INVITATION_ALREADY_PENDING`); a pending invitation is resent from Administration, which revokes the old link rather than leaving two working ones.

## D-025: What a Doctor May Change About Themselves

- **Status:** Accepted (P20-T03)
- **Decision:** A doctor edits their own profile through `GET`/`PATCH /api/v1/me/doctor-profile`, resolved from the signed-in user through `DoctorProfile.ownerUserId` — never from an id in the path. They may change **full name, title, degrees, phone number and education history**. They may **not** change specialty, licences (STR/SIP and the flat licence number), NIK, the SATUSEHAT practitioner (IHS) id, `isActive`, the linked account, or their sign-in email. The route's schema (`updateOwnDoctorProfileSchema`) is its own and `strict`, so an administrative field is refused with 400 rather than silently dropped. `doctor.update:own` is granted to `DOCTOR`; the administrative `PATCH /doctors/:id` and the credential-option catalog now require the `:any` scope.
- **Why:** The editable fields are how a doctor is addressed and reached — a misspelt name or a changed phone number should be a thirty-second fix, not a support request. Everything else is something the clinic *asserts* about the doctor: specialty and licences are credentials checked at onboarding and printed on prescriptions and lab reports; the NIK and the IHS number are national identity that decide which SATUSEHAT record every encounter lands in (a NIK change follows P21-T09's unlink rule, an IHS number changes only through the NIK link or P21-T08's verified manual path); status and the account link are administration; the email is owned by `User` and changed in Administration (D-024). Education stays with the doctor because it is history they know best, and its field of study is still checked against the clinic's catalog. Photo was in the suggested split but there is no photo column or storage for one, so it is deferred rather than half-built.
- **Consequence:** Granting `doctor.update:own` exposed two routes that checked only the action. `PermissionsGuard` lets any scope through, so the administrative `PATCH /doctors/:id` — whose own-scope branch let an owner change their specialty, NIK, licences, SATUSEHAT id and even deactivate themselves — now refuses anything below `:any`, and the credential-option catalog (which has no owner at all) checks `:any` in its service. Self-edits are audited (`UPDATE` on `DoctorProfile`, `metadata.scope = 'OWN'`, field names only, never values); administrative doctor edits are still not audited, which predates this decision. `DoctorOwnProfileService.resolveOwnDoctorProfileId` is exported so P21-T04 reuses the same "which profile is mine" rule.

## D-026: A Doctor Completes Their Profile Before the Dashboard

- **Status:** Accepted (P20-T02; amends D-025 for the one case where no clinic value exists yet)
- **Decision:** The gate is "is this doctor's profile complete", never "is this the first login". Completeness is one shared predicate, `resolveMissingDoctorProfileFields` (`@hms/shared-types`), derived from the required keys of `createDoctorSchema` minus the account's email — so a field made required there re-opens the gate for every profile that predates it, with no second list. The API judges it when it issues a session (login, MFA, refresh) and writes `profileIncomplete: true` into the session hint only when it is; `proxy.ts` then pins the doctor to `/doctor/complete-profile` (remembering where they were going, honoured only inside the doctor shell), the doctor layout drops the sidebar and assistant, and `POST /api/v1/me/doctor-profile/completion` saves. The web re-issues the session straight afterwards through the single-flight refresh, so the next hint is clean. Doctors only.
- **Why:** The two onboarding routes leave people in different states. A doctor the administrator created (D-024) already has every required field and never sees the screen. A person invited from Administration with the DOCTOR role signs in with no doctor record at all and must create one before they can work. Judging completeness rather than "first login" is the only version that stays right when an administrator fills in half a profile or a field becomes required later. The flag rides in the hint rather than being fetched because `proxy.ts` runs at the edge on every navigation, where a database read per page is not affordable and offboarding already set the precedent.
- **Consequence:** For the invited case D-025's "the clinic asserts it" has nothing to assert yet, so the completion route lets the doctor enter specialty, STR number and NIK **once**, while each is empty; a value already on file is refused with 409 (`DOCTOR_PROFILE_FIELD_LOCKED`) rather than overwritten, and the ordinary `me/doctor-profile` route still never accepts them. The route requires an active DOCTOR role, not just `doctor.update:own`. Other roles are never gated until P20-T04 decides what a profile is for them. Sessions issued before this change carry no flag and read as complete until their next refresh re-judges them.

## D-027: A Person's Name Lives on Their Account

- **Status:** Accepted (P20-T04; completes the P20 set with D-024, D-025 and D-026, and supplies the staff identity D-033 depends on)
- **Decision:** Every human account carries **one** name: a new `User.fullName`. It is the identity of record for doctors and non-doctors alike, and everything that answers "who did this" resolves through a single helper — `User.fullName`, falling back to `DoctorProfile.fullName` while an account does not exist yet, and to the email address only for accounts nobody has named. `DoctorProfile.fullName` is demoted to exactly that fallback: the name an administrator types when creating a doctor who has no account (D-024 collects the address; the `User` row is only born when the invitation is accepted, because `password_hash` is not nullable). Accepting the invitation copies it onto the account, attaching an existing account keeps the account's name, and from then on the account wins. Doctor self-service (D-025) writes the account name and mirrors it to the profile while that column survives; the column is removed once no doctor profile can exist without an account. A name is **not** a per-role profile: the four non-doctor staff roles (`ADMIN`, `SUPER_ADMIN`, `PHARMACIST`, `LAB_TECHNICIAN`) get no new table. An administrator supplies the name when creating or inviting an account, and may correct it; the person may correct their own. Roles, status, organisation unit and the sign-in address stay administrative, exactly as D-025 splits them for doctors. Richer staff attributes — contact number, job title, photo — are deliberately **not** decided here; if they multiply, they justify a `StaffProfile` keyed to the account in the shape `PatientProfile` and `DoctorProfile` already use, and that is a later decision, not this one.
- **Why:** `User` has ten columns, no name, and 59 relations recording what a person did. Every "who did this" surface already joins it, so one column there answers the question everywhere at once, while a second profile table would make each of those surfaces try two profiles before giving up on an email. The consequences of having no name are not cosmetic: a lab technician who verifies a result signs it `lab1@klinik.id` on a document handed to a patient (`lab-report.repository.ts` `doctorProfile?.fullName ?? user.email`, printed bold in the signature block), a receptionist appears the same way on the "Kasir" line of an invoice, and the web shell fabricates a name by title-casing the email local part, so `apotek1@klinik.id` is greeted as "Apotek1" with an "A" avatar. Elsewhere the name is simply missing: the audit API returns an actor uuid and a role string with no join to `User` at all, a dispensing pharmacist is a bare id that nothing renders, and `performedByName` on an immunization and `orderedByName` on a lab order come only from a doctor profile, so a nurse or technician yields `null`. An administrator cannot even search staff by name, because search is email-only. The doctor's name was not moved onto the account wholesale precisely because a `DoctorProfile` legitimately precedes and can outlive a `User` — that is what makes "which name wins" answerable instead of a standing contradiction. The gate stays doctors-only (the product owner's call): an administrator who creates or invites the account knows the person's name and types it then, so nobody is stopped at a form on the release that ships this, and D-026's predicate is untouched because the doctor's name is still required at creation.
- **Consequence:** One migration adds `User.fullName` (nullable, because every existing row has no name) and backfills it from the owned `DoctorProfile` where an account is linked. Everything else is call sites: roughly 32, of which two are structural. The first is the session claim — the shell, avatar, dashboard greeting and AI transcript all read `resolveShellProfile`, which has only JWT claims to work with, so a name claim in the access token and session hint fixes the whole shell at once and retires the email-local-part fabrication (`isFallbackName` then means what it says; today it is dead, since every signed-in account has an email). The second is audit, the only place with no name-bearing path at all, which needs the actor joined to a name in `audit-query.service.ts`. The rest are the resolver replacing `doctorProfile?.fullName ?? email` in the lab report verifier, the invoice cashier and void lines and the organisation roster; `uploadedByEmail`, approver and decision emails, delivery-consent granted-by, customer-service transcripts and the vault-share, approval and invitation copy; and attribution that is absent rather than wrong — dispensed-by, plus `performedByName` and `orderedByName` falling back to the account name. Existing accounts stay nameless and keep showing an email until an administrator fills one in; no one is locked out, and no seeded role changes. Two inconsistencies are fixed in passing rather than preserved: the administration users table renders `user.email` even though the API already returns a `fullName` resolved from the doctor profile (`admin-management.service.ts`), while the organisation roster does use it — and staff search stays email-only until the same ticket extends it to the name. The follow-up work is filed as P20-T05 (schema, create/invite and self-edit), P20-T06 (adopt the resolver across the display surfaces), P20-T07 (audit and clinical attribution), P20-T08 (the name claim and the shell) and a docs chore for the numbering below.
- **Where this record lives:** P20-T04 asked for `docs/decisions/`, which does not exist in this repository and never has. There are two decision files, and their numbering already collides: `docs/post-mvp/decisions.md` opens by saying the MVP file "ends at D-021", which stopped being true when D-022 through D-026 were added here, so each of those numbers now names two different decisions. This record continues the P20 cluster (D-024, D-025, D-026) here as D-027, the post-MVP preamble is corrected to say where its own numbering starts and why, and renumbering the six duplicates is left to the docs chore rather than smuggled into an unrelated PR. P22-T01's D-033 keeps the number it was filed under, in `docs/post-mvp/decisions.md`.
