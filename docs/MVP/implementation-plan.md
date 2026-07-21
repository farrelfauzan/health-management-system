# HMS Implementation Plan (MVP)

## 1. Delivery Principles

- Ship by phase and task, with one git branch per task.
- Keep backend module layering strict: `repository`, `service`, `controller`.
- Keep quality gates mandatory before merge: lint -> typecheck -> unit -> integration -> build.

## 2. Branching Strategy for Tasks

- Branch naming for this plan: `feature/p<phase>-t<task>-<short-desc>`.
- Example: `feature/p1-t03-bootstrap-nextjs-web`.
- One task = one PR when possible.
- If a task is too large, split into `...-a` and `...-b` subtasks.

## 3. Phase 1 - Foundation and Tooling (11 Tasks)

Goal: monorepo baseline and working local/dev pipeline.

1. `P1-T01` Create root workspace files (`pnpm-workspace.yaml`, root `package.json`, `.gitignore`).
2. `P1-T02` Scaffold `apps/api` NestJS workspace with health endpoint (`/api/v1/health`).
3. `P1-T03` Scaffold `apps/web` Next.js App Router workspace.
4. `P1-T04` Scaffold shared packages: `packages/shared-types`, `packages/config`, `packages/ui`.
5. `P1-T05` Add shared TypeScript, ESLint, and Prettier presets and wire all workspaces.
6. `P1-T06` Configure Tailwind v4 in `apps/web` using `@tailwindcss/postcss`.
7. `P1-T07` Initialize shadcn/ui in monorepo mode with `components.json` in `apps/web` and `packages/ui`.
8. `P1-T08` Configure Prisma v7.8.0 in `apps/api` with `prisma.config.ts`, adapter-based client, and initial generate flow.
9. `P1-T09` Add Docker dev stack (`postgres`, `api`, `web`) with healthchecks and explicit migration command.
10. `P1-T10` Add GitHub Actions baseline CI (install, lint, typecheck, unit, integration, build).
11. `P1-T11` Add the common object-storage foundation: typed configuration validation, storage interface, S3 adapter, and isolated adapter tests.



## 4. Phase 2 - Auth, IAM-Style RBAC, and Security Baseline (8 Tasks)

Goal: secure platform baseline before domain modules.

1. `P2-T01` Create auth and access schema migration (`User`, `Role`, `Permission`, `RolePermission`, `UserRole`).
2. `P2-T02` Implement auth repository/service/controller for login, refresh, logout.
3. `P2-T03` Implement JWT guard and token validation strategy.
4. `P2-T04` Implement CASL ability factory (`@casl/ability`) and `PermissionsGuard` for `resource.action:scope` checks.
5. `P2-T05` Implement IAM-style role assignment/unassignment flow for admins.
6. `P2-T06` Implement ownership policy checks for `:own` resources using CASL conditions + repository-level query filters.
7. `P2-T07` Wire decorator pattern from `docs/decorator-references` (`Auth`, `CheckPermissions`, `PublicRoute`, `AuthUser`) in protected controllers.
8. `P2-T08` Add unit/integration tests for auth + RBAC critical paths (CASL ability, guard behavior, decorator metadata, and 403/200 cases).

Phase 2 implementation note:

- Backend RBAC package baseline: `@casl/ability`.
- Frontend CASL package wiring (`@casl/ability`, `@casl/react`) starts in Phase 3 UI work, but backend policy remains source of truth.
- Authorization wiring uses a shared/global module with `APP_GUARD` registration for JWT + permission guards.
- Include RBAC management endpoints in Phase 2 baseline: role catalog (`GET /rbac/roles`), assign-role, and unassign-role.



### 4.1 S3 Object Storage Provider (`P1-T11`)

- Place the reusable storage contract under `apps/api/src/common/storage/`; keep the AWS SDK implementation in an infrastructure adapter so domain services do not depend directly on S3.
- Register and export the provider-neutral contract from `StorageModule` so feature services can inject it without importing AWS SDK clients.
- Define a typed `ObjectStorageService` contract with `upload`, `get`, `getSignedUrl`, and `delete` methods. Use request/response objects instead of long primitive parameter lists.
- Implement `S3StorageService` with injected `ConfigService`; validate bucket, region, endpoint, credentials/provider chain, signed-URL expiry, maximum upload size, and allowed MIME types at startup.
- Keep the bucket private. `getSignedUrl` returns a short-lived URL and expiry metadata; signed URLs are never stored in PostgreSQL.
- Do not add a generic storage controller or standalone S3 endpoints. File APIs and lifecycle rules belong to the domain module that owns the file.
- Generate opaque object keys on the server; reject caller-supplied keys and never include PII in keys or logs.
- Feature upload flow: validate domain authorization and file metadata, upload through the injected provider, persist the object key in the feature-owned record, and compensate for partial failures.
- Feature delete/replacement flow: update feature-owned metadata and delete objects idempotently. A missing S3 object is treated as an already-completed delete.
- `get` is reserved for trusted backend streaming/use cases; normal web display uses `getSignedUrl` to avoid proxying object bytes through the API.
- API response mappers resolve stored object keys to signed URLs and include expiry metadata. No endpoint may return an object key, permanent S3 URL, or unsigned bucket URL.
- Keep controllers transport-only, feature services responsible for workflow orchestration, feature repositories responsible for object-key persistence, and the storage adapter responsible only for object operations.
- Use explicit TypeScript input/output types, no `any`, one export per file, kebab-case files, verb-prefixed methods, and JSDoc on public classes and methods.
- Add isolated adapter tests with a mocked S3 client. Each consuming feature adds service and integration tests for authorization, validation, compensation, signed-URL responses, and idempotent cleanup.



## 5. Phase 3 - Core Clinical Backend Modules (Backend-Only, 7 Tasks + Module Subtasks)

Goal: deliver all core clinical backend modules and stable APIs before any frontend feature integration.

Phase 3 execution gate (mandatory):

- No new frontend integration tasks are started in this phase.
- Each module must finish backend layering (`repository` -> `service` -> `controller`), RBAC checks, response envelope, and tests.
- Frontend planning is allowed, but frontend implementation starts only after `P3-T07` is complete.

1. `P3-T01` Admin management backend module + APIs.
2. `P3-T02` Patient management backend module + APIs.
3. `P3-T03` Doctor management backend module + APIs.
4. `P3-T04` Appointment management backend module + APIs.
5. `P3-T05` Registration flow backend module + APIs.
6. `P3-T06` Pharmacy flow backend module + APIs.
7. `P3-T07` Backend readiness gate for frontend handoff (contracts, tests, API stability checklist).

Execution strategy by module:

### 5.1 Admin Management (`P3-T01`)

- `P3-T01.1` Define shared Zod DTO contracts in `packages/shared-types` (list/create/update admin user payloads).
- `P3-T01.2` Add repository methods for admin/user listing, create, update, role-binding reads.
- `P3-T01.3` Implement service-layer business rules (status toggles, conflict checks, role constraints).
- `P3-T01.4` Implement controller endpoints + permission metadata + response envelope.
- `P3-T01.5` Add backend unit/integration tests for 200/403/404/conflict cases.



### 5.2 Patient Management (`P3-T02`)

- `P3-T02.1` Add the focused `DoctorPatient` and append-only `DoctorPatientActivity` schema migration, audit indexes, and partial unique index for active doctor-patient pairs.
- `P3-T02.2` Define shared patient DTO schemas (create/update/search/detail), including optional initial `doctorIds` and compact related-doctor response types.
- `P3-T02.3` Implement repository queries with `deletedAt` filtering, pagination, active doctor-assignment filters, relation counts for lists, and explicit related-doctor projections for detail reads.
- `P3-T02.4` Implement service validation (MRN uniqueness, identity constraints, active doctor IDs, duplicate IDs, and ownership scope behavior). Create the patient and initial `DoctorPatient` rows atomically.
- `P3-T02.5` Implement REST endpoints with permission checks (`patient.read:any|own`, `patient.create:any`, update rules), plus explicit doctor assignment/unassignment and activity-log operations.
- `P3-T02.6` Add tests for multi-doctor creation, assigned-doctor access, unassigned-doctor denial, relation filtering, duplicate assignment conflict, retained reassignment history, activity-log authorization/filtering, rollback, and validation errors.



### 5.3 Doctor Management (`P3-T03`)

- `P3-T03.1` Define doctor profile/schedule DTO schemas in shared-types, including optional initial `patientIds` and compact related-patient response types.
- `P3-T03.2` Implement doctor repository methods (profile CRUD, schedule read/write, active patient-assignment filters, relation counts for lists, and explicit related-patient projections for detail reads).
- `P3-T03.3` Add service rules for schedule overlaps, ownership writes, active patient validation, duplicate IDs, and atomic doctor + initial `DoctorPatient` creation.
- `P3-T03.4` Implement endpoints and CASL permission checks for schedule, patient assignment/unassignment, and assignment activity-log operations.
- `P3-T03.5` Add tests for schedule conflicts, multi-patient creation, relation filtering, retained assignment history, activity-log reads, rollback, and own-vs-any authorization.

Doctor-patient repository/service behavior:

- Use the explicit `DoctorPatient` junction as the source of truth. Do not infer durable care relationships from appointments, registrations, or prescriptions.
- Repositories expose query-focused methods for active relation existence, filtered lists, compact relation summaries, detail projections, assignment creation, and audited unassignment.
- Services validate that both profiles exist and are active, deduplicate relation IDs, enforce authorization, and own transaction boundaries.
- Create operations accept optional related profile IDs and fail atomically if any ID is missing, inactive, unauthorized, or duplicated.
- List endpoints avoid loading unbounded nested records; return counts/compact summaries and paginate the primary resource. Detail endpoints may return paginated or bounded active relations.
- Doctor `patient.read:own` queries must join through an active assignment (`unassignedAt: null`). Admin-level `:any` reads are not relation-limited.
- Assignment and unassignment are explicit, idempotent service operations with actor/timestamp lifecycle fields. An unassigned row is immutable history, and reassignment creates a new row.
- The same transaction that creates or unassigns a relationship appends an immutable `DoctorPatientActivity` event; normal application flows never update or delete activity records.
- The paginated activity log reads these events, supports doctor, patient, action, actor, and date-range filters, and requires `doctor-patient.activity.read:any`.
- Direct repository access across patient and doctor modules is prohibited.



### 5.4 Appointment Management (`P3-T04`)

- `P3-T04.1` Define appointment DTO schemas (create/list/update/cancel).
- `P3-T04.2` Implement repository queries with status/date filters and ownership constraints.
- `P3-T04.3` Implement service transaction boundaries for create/update/cancel.
- `P3-T04.4` Enforce business rules (availability, allowed status transitions, patient-update limits).
- `P3-T04.5` Add integration tests for transaction integrity and permission matrix.



### 5.5 Registration Flow (`P3-T05`)

- `P3-T05.1` Define registration DTO schemas (create/list/update/status transitions).
- `P3-T05.2` Implement repository methods with patient/status/time-based filters.
- `P3-T05.3` Implement service transition rules (pending -> checked_in -> completed/cancelled).
- `P3-T05.4` Add controller endpoints with ownership checks and limited patient update fields.
- `P3-T05.5` Add tests for invalid transitions and own-vs-any authorization.



### 5.6 Pharmacy Flow (`P3-T06`)

- `P3-T06.1` Define medication/prescription/dispense DTO schemas in shared-types.
- `P3-T06.2` Implement repositories for medication reads, prescription writes, and dispense records.
- `P3-T06.3` Implement transactional dispensing logic and stock mutation safeguards.
- `P3-T06.4` Enforce permission boundaries (`prescription.write:any|own`, `dispense.write:any`).
- `P3-T06.5` Add integration tests for stock consistency and authorization matrix.



### 5.7 Backend Readiness Gate (`P3-T07`)

- `P3-T07.1` Verify all Phase 3 module endpoints are documented in OpenAPI with request/response examples.
- `P3-T07.2` Verify RBAC permission coverage for all Phase 3 endpoints.
- `P3-T07.3` Run full backend validation pipeline (lint -> typecheck -> unit -> integration -> build).
- `P3-T07.4` Publish frontend handoff notes (endpoint catalog, payload contracts, pagination/filter conventions).



## 6. Phase 4 - Frontend Integration (Design-Driven, 11 Tasks + Subtasks)

Goal: implement the frontend against the stable backend APIs, matching the new "Clinical Precision" design.

Frontend start criteria:

- `P3-T07` completed (done — all module hooks are generated under `apps/web/lib/api/generated/`).
- Contracts for target backend module are stable (OpenAPI exported and shared schema aligned).

Design references (mandatory reading before any Phase 4 task):

- `docs/new-salingjaga-design/clinical_precision_system/DESIGN.md` — authoritative design system: full color-token frontmatter, typography scale (Geist / Inter / Geist Mono), radii, spacing, component specs (buttons, inputs, enterprise tables, badges, modals).
- `docs/new-salingjaga-design/<screen>/screen.png` + `code.html` — five high-fidelity screens: `hms_dashboard_overview`, `patient_management`, `appointment_scheduling`, `pharmacy_queue`, `ai_clinical_assistant`. The HTML files are Stitch prototypes (Tailwind CDN + inline config) — visual reference only; never copy their markup, CDN scripts, or inline config into the app.
- `docs/design_handoff_hms_shell/` is **superseded** by this design. Keep it for history; no new work targets it.

Decisions locked for this phase:

- **Branding:** the prototypes show "St. Luke's Medical Center" placeholder branding — replace with "Saling Jaga" everywhere (brand block, portal names, greeting copy). Prototype people/photos are placeholders — use initials avatars.
- **Screens without a design** (Login, Doctors, Registration, Administration) are extrapolated from `DESIGN.md` tokens and the shared compositions — no new visual language may be invented for them.
- **Dummy-data rule:** anything the backend does not provide yet (AI assistant, activity feed, admission trends, inventory value, expiring-soon counts, allergies/interaction alerts, notifications, departments, STAT priority) is rendered from typed mock modules in `lib/<feature>/mock-<name>.ts`, each with a `// DUMMY-DATA:` header documenting the missing backend contract. Dummy data never lives inline in components, so real wiring is a greppable swap later.
- **Icons:** Material Symbols Outlined (as used by all five prototypes) replaces the previously planned lucide set — self-hosted via the `material-symbols` npm package behind a shared `@hms/ui` icon component, no Google Fonts CDN at runtime.
- **Bilingual/Settings dropped:** the old handoff's language toggle does not exist in the new design. MVP ships English-only; a settings surface can return post-MVP.
- Loading/error/empty states are not designed: default to skeleton rows for tables and a standard empty-state card.
- Task order: `P4-T01`–`P4-T03` are the foundation and land in order; `P4-T04`–`P4-T11` each depend on `P4-T02` + `P4-T03` and then proceed independently (one branch/PR per task).

1. `P4-T01` Auth session + login page (not in design; extrapolated).
2. `P4-T02` Design foundation: theme tokens, fonts, icon system, `@hms/ui` primitives, shared compositions.
3. `P4-T03` App shell: sidebar, top bar, `/admin` route restructure.
4. `P4-T04` Dashboard (Hospital Overview).
5. `P4-T05` Patients (Patient Directory + detail + assignment).
6. `P4-T06` Doctors (extrapolated design).
7. `P4-T07` Appointments (calendar + scheduling).
8. `P4-T08` Registration (extrapolated design).
9. `P4-T09` Pharmacy (queue + dispense workflow).
10. `P4-T10` Administration (admin users — migrate existing page).
11. `P4-T11` AI Clinical Assistant (dummy UI, backend post-MVP).

Execution strategy by task:

### 6.1 Auth Session + Login Page (`P4-T01`)

Backend endpoints and web plumbing already exist (`useAuthControllerLoginV1/RefreshV1/LogoutV1` generated hooks, `lib/auth/access-token-cookie.ts`, `lib/auth/access-token-claims.ts`); this task builds the missing UI and closes the session loop. Style is extrapolated from `DESIGN.md`: `#f8f9ff` page background, white card with `slate-200` border and 12–16px radius, Geist headings, Geist-Medium 12px field labels above inputs, focus ring per input spec, solid `#0066FF` primary button, "Saling Jaga" brand mark.

- `P4-T01.1` Build `/login` route: server component page shell + `components/client/auth/login-form.tsx` (TanStack Form + shared Zod login schema from `@hms/shared-types`, generated login mutation).
- `P4-T01.2` On success: `setAccessTokenCookie(...)`, redirect to `/admin/dashboard`. Map the API error envelope (`error.code/message`) to an inline invalid-credentials message.
- `P4-T01.3` Update `proxy.ts`: unauthenticated or expired `/admin/*` requests redirect to `/login` (currently `/`); an authenticated user hitting `/login` redirects to `/admin/dashboard`; keep the role gate and cookie cleanup behavior. Extend `config.matcher` accordingly.
- `P4-T01.4` Implement session teardown for reuse by the shell (`P4-T03`): a `lib/auth` logout helper that calls the logout mutation, clears the cookie, and redirects to `/login`; wire 401 handling in `lib/api/http.ts` to clear the cookie and redirect to `/login`.
- `P4-T01.5` Repurpose `app/page.tsx`: replace the placeholder landing with a redirect — authenticated → `/admin/dashboard`, otherwise → `/login`.
- `P4-T01.6` UI tests: schema validation errors, failed-login error rendering, redirect-on-success, proxy redirect matrix (no token / expired / wrong role / valid).



### 6.2 Design Foundation (`P4-T02`)

Encode `DESIGN.md` once, so screen tasks only assemble.

- `P4-T02.1` Theme tokens in `@hms/ui` `globals.css` (Tailwind 4 `@theme`): the full color frontmatter from `DESIGN.md` (`surface*`, `on-surface*`, `primary` `#0050cb` / `primary-container` `#0066ff`, `secondary` teal, `tertiary`, `error`, `outline*` roles) plus the semantic status palette (success emerald, warning amber, danger rose as 10%-tint badge pairs); radius scale (sm 4px / base 8px / md 12px / lg 16px / full); spacing baseline (4px grid, 1440px container, 240px sidebar width).
- `P4-T02.2` Fonts: Geist + Geist Mono via the `geist` package, Inter via `next/font/google`, exposed as `--font-geist`, `--font-geist-mono`, `--font-inter` and mapped in the theme (Geist for headings/labels/technical data, Inter for body, Geist Mono for IDs/numeric table cells per `DESIGN.md`).
- `P4-T02.3` Icon system: add `material-symbols` (self-hosted variable font) to `@hms/ui` behind a single `icon` component (name + size + fill props); no per-screen icon imports from CDNs.
- `P4-T02.4` Generate missing shadcn primitives **into** `packages/ui` via the shadcn CLI (`badge`, `label`, `avatar`, `skeleton`, `dialog`, `dropdown-menu`, `tabs`, `popover`, `textarea`, `separator`) and export them from `@hms/ui`. Never `shadcn add` inside `apps/web`.
- `P4-T02.5` Shared compositions in `apps/web/components` (one component per file): `page-header` (breadcrumb + Geist title + subtitle + right-aligned actions), `stat-card` (icon tile, uppercase label, big value, helper/trend line, optional progress bar — per dashboard/pharmacy screens), `status-badge` (pill, 10%-tint background mapping: confirmed/arrived/in-progress/completed/cancelled/pending, in-patient/out-patient/discharged, stat/regular, low-stock/urgent), `data-table` shell (sticky `slate-50` header with uppercase 12px Geist labels, Inter cells, Geist Mono ID/number cells, row bottom-border only, hover shift, kebab `row-actions-menu` via dropdown), `filter-card` (labeled controls + export/action slots), `numbered-pagination` ("Showing X–Y of N" + page number buttons), `avatar-initials`, `timeline-list` (dot + time + title + description, per Recent Activity), `empty-state`, `table-skeleton`.
- `P4-T02.6` Unit tests: `status-badge` variant mapping, `numbered-pagination` windowing, `data-table` cell typography slots.



### 6.3 App Shell (`P4-T03`)

- `P4-T03.1` Restructure routes: `app/admin/layout.tsx` (server component) renders sidebar + top bar + scrollable `#f8f9ff` content area; segments `/admin/dashboard`, `/admin/patients`, `/admin/doctors`, `/admin/appointments`, `/admin/registrations`, `/admin/pharmacy`, `/admin/ai-assistant`, `/admin/administration` (placeholder pages where the screen task hasn't landed); `/admin` redirects to `/admin/dashboard`.
- `P4-T03.2` Sidebar (`components/client/shell/`): fixed 240px, white surface with right border; brand block (rounded primary tile + "Saling Jaga" name + "Medical Center"-style subtitle); nav items with Material Symbols icons — active item is a solid `#0066FF` rounded bar with white text, inactive slate; "ADVANCED" section label grouping AI Assistant + Administration (per patient screen). Drop the prototype's "Pro Account" upsell card; no collapse behavior in this design.
- `P4-T03.3` Top bar: global search field (routes to `/admin/patients?q=...` on submit — patient search is the only real search backend; full cross-entity search is out of MVP scope), AI-assistant shortcut icon → `/admin/ai-assistant`, notification bell with unread dot opening a static dummy dropdown (`lib/shell/mock-notifications.ts`), profile block (initials avatar + name + role from access-token claims) with a dropdown containing Logout (from `P4-T01.4`).
- `P4-T03.4` Per-route page metadata (breadcrumb trail + title + subtitle copy) consumed by `page-header`.
- `P4-T03.5` RBAC nav visibility: filter nav items via CASL ability (`lib/rbac`) mirroring backend permissions — visibility only, backend guard stays the source of truth.
- `P4-T03.6` UI tests: active-route highlighting, role-filtered nav, logout flow, search submit navigation.



### 6.4 Dashboard — Hospital Overview (`P4-T04`)

- `P4-T04.1` Header row: "Hospital Overview" + greeting composed from access-token claims ("Good morning, Dr. X. Here's what's happening today at Saling Jaga."), current-date chip, "New Case" primary button → registration create flow.
- `P4-T04.2` Stat cards (4-up grid) — real where the backend provides it: Today's Patients (registration list filtered to today, `meta.total`), Appointments (today's appointments `meta.total` + "N upcoming in the next hour" computed from the fetched page), Doctors on Duty (active doctors `meta.total`; specialty breakdown line is dummy until a group-by endpoint exists), Pending RX (pending prescriptions `meta.total`, urgent styling). If a needed filter is missing from the API, fix the API contract and regenerate — do not compute counts client-side from full lists.
- `P4-T04.3` Upcoming Appointments table card: generated appointments hook (today, soonest-first), columns avatar+name+mono ID / reason / time / status badge / kebab actions, "N Total" chip, "View Full Schedule" link → `/admin/appointments`. Auto-refresh via TanStack `refetchInterval` (5 min) with the "Next automatic refresh in mm:ss" footer countdown tied to it.
- `P4-T04.4` Right rail: Quick Actions card (Register Patient → registration create, Schedule Appointment → `/admin/appointments`, Generate Report → dummy disabled action with tooltip); Recent Activity timeline from `lib/dashboard/mock-activity.ts` (`// DUMMY-DATA:` — backend audit feed does not exist yet).
- `P4-T04.5` Skeleton/empty states; UI tests for stat cards from mocked query states and the refresh countdown.



### 6.5 Patients — Patient Directory (`P4-T05`)

- `P4-T05.1` Directory table per design: initials avatar + name + sex/age line, Geist Mono patient ID (MRN), last-visit column (patient `updatedAt` until encounter data exists — note in the column tooltip), assigned doctor (first active related doctor from the bounded relation summary, "+N" overflow), status badge (map backend patient status enums to the IN-PATIENT / OUT-PATIENT / DISCHARGED design vocabulary; if the enums don't align, fix the shared contract first), kebab actions (View / Edit / Assign Doctor).
- `P4-T05.2` Filter card: Quick Filter (name or ID search), Status select, Date Range (createdAt), Export button (client-side CSV of the current filtered page); Department select renders as a disabled dummy control (`// DUMMY-DATA:` — no department concept in the MVP backend).
- `P4-T05.3` Numbered pagination ("Showing 1–10 of N patients") wired to query params.
- `P4-T05.4` Add/Edit patient dialogs using shared Zod schemas + TanStack Form (including optional initial `doctorIds`); mutations invalidate the list.
- `P4-T05.5` Patient detail page (extrapolated from the design system): demographics, active related doctors (compact projections), doctor assignment/unassignment controls via the explicit doctor-patient endpoints, activity log (guarded by `doctor-patient.activity.read:any`).
- `P4-T05.6` Below-table cards from the design: Admission Trends chart card (inline-SVG dummy chart from `lib/patients/mock-admission-trends.ts`) and Active Alert card (dummy) — both clearly mock-backed.
- `P4-T05.7` UI tests: role-based visibility (`patient.read:any` vs `:own`), status mapping, filter → query-param round trip, duplicate-assignment conflict feedback.



### 6.6 Doctors (`P4-T06`, extrapolated design)

No dedicated screen — assemble strictly from `P4-T02` compositions and `DESIGN.md` tokens, mirroring the Patient Directory layout.

- `P4-T06.1` Doctor directory: filter card (search, specialty, status) + data-table (name + specialty, mono ID, schedule summary cell, assigned-patient count, status badge, kebab actions), numbered pagination.
- `P4-T06.2` Doctor profile create/edit forms and schedule management forms (shared schemas), schedule-overlap conflict feedback surfaced from API errors.
- `P4-T06.3` Guarded patient assignment controls and bounded related-patient summaries (mirror of `P4-T05.5`).
- `P4-T06.4` UI tests: conflict feedback, relation mutations, permission-aware controls.



### 6.7 Appointments — Calendar & Scheduling (`P4-T07`)

The largest screen task; split into `-a` (calendar read views) and `-b` (scheduling mutations) branches if the PR grows.

- `P4-T07.1` Layout: secondary left panel (Schedule Appointment primary button; Medical Staff checklist fed from the doctors API — initials avatar, name, specialty, checkbox filter; Appointment Types legend) + calendar area with range title, Today/prev/next controls, view switcher, print button (`window.print`).
- `P4-T07.2` Week view: hand-built CSS-grid time grid (hours × 7 days), event blocks from the appointments API colored by type per the legend (consultation = primary blue, surgery = tertiary red, follow-up = teal — map to backend appointment type/status vocabulary via the shared contract), current-time red indicator line, weekend column tint.
- `P4-T07.3` Table view: reuse the `data-table` composition as the list alternative (columns time/patient/doctor/type/status/actions). Day and Month views are a follow-up subtask (`P4-T07.3b`) — the switcher renders all four options with Day/Month disabled until then.
- `P4-T07.4` Scheduling: Schedule Appointment dialog (patient + doctor + slot pickers honoring availability errors from the API), reschedule and cancel flows with optimistic invalidation, allowed status transitions only.
- `P4-T07.5` Capability checks for admin/doctor/patient action variants.
- `P4-T07.6` UI tests: event placement math, staff filtering, lifecycle transitions, rejected-transition error rendering.



### 6.8 Registration (`P4-T08`, extrapolated design)

- `P4-T08.1` Registration queue: filter card (search, status, date) + data-table with status badges for `pending → checked_in → completed/cancelled`, numbered pagination.
- `P4-T08.2` Registration create dialog (target of Dashboard's "New Case" / "Register Patient" quick actions) and status-transition actions offering only API-allowed transitions.
- `P4-T08.3` Patient self-service registration pages (own-scope), reusing the same compositions.
- `P4-T08.4` Role-based action gating for admin/doctor/patient flows.
- `P4-T08.5` UI tests: status transitions, invalid-transition feedback, own-vs-any visibility.



### 6.9 Pharmacy — Queue & Dispense (`P4-T09`)

- `P4-T09.1` Stat row: Pending Orders (real pending-prescription `meta.total`, solid-primary card with "View Full Queue" scrolling to the queue), Low Stock Alerts (real count from medication stock thresholds), Total Inventory Value and Expiring Soon (dummy — the MVP medication schema has no price/expiry fields; `lib/pharmacy/mock-inventory-stats.ts` with `// DUMMY-DATA:` notes for the post-MVP contract).
- `P4-T09.2` Incoming Prescription Queue: pending prescriptions as cards (Geist Mono RX number, patient + mono ID, medication summary, elapsed time from `createdAt`), All / STAT-Only toggle — STAT badge is dummy-derived (`REGULAR` for all real rows) until the prescription contract gains a priority field; note it as an optional API extension.
- `P4-T09.3` Prescription Details panel: selected prescription's real patient demographics + line items (qty/NDC-style mono chips from the real medication data); Allergies and Clinical Interaction Alert render from `lib/pharmacy/mock-clinical-flags.ts` (`// DUMMY-DATA:` — no clinical/allergy data in MVP).
- `P4-T09.4` Verification Steps checklist (client-side state) gates the Dispense Now button; Dispense Now calls the transactional dispense endpoint, surfaces stock-mutation failures from the error envelope, and invalidates stock + prescription queries together; Print Label = `window.print` dummy.
- `P4-T09.5` UI tests: dispense flow + failure recovery, checklist gating, stock-threshold rendering, authorization matrix (doctor vs pharmacist).



### 6.10 Administration (`P4-T10`, extrapolated design)

- `P4-T10.1` Migrate the existing `/admin/users` page (`admin-users-shell` / `admin-users-panel`) to `/admin/administration` inside the new shell and compositions; delete superseded bespoke UI.
- `P4-T10.2` Filter card (search, role select fed from `GET /api/v1/rbac/roles`, status) + data-table with role/status badges, kebab actions, numbered pagination wired to `lib/admin-users/search-params.ts`.
- `P4-T10.3` Create/update user dialogs using shared Zod schemas + TanStack Form; mutations invalidate the list.
- `P4-T10.4` UI tests: guarded actions (CASL), mutation error envelope rendering, filter round trip.



### 6.11 AI Clinical Assistant (`P4-T11`, dummy UI — backend is post-MVP Phase 13)

Build the full screen from the design now, entirely mock-backed, structured so Phase 13 swaps the mock service for the real one without UI changes.

- `P4-T11.1` Layout: secondary panel (New Consultation button, Suggested Analysis prompt cards, Recent History list) + chat thread + composer (attach/mic buttons rendered disabled-dummy, send enabled).
- `P4-T11.2` `lib/ai-assistant/` typed mock conversation service (`// DUMMY-DATA:` header): canned scripted responses keyed to the suggested prompts, simulated streaming delay, clinical-reference chips; the UI consumes only the service interface so the real Phase 13 client is a drop-in.
- `P4-T11.3` Chat rendering per design: assistant/user bubbles, reference chip cards, italic AI-suggestion disclaimer line, persistent confidential-data disclaimer footer.
- `P4-T11.4` Gate the route + nav item behind an admin/doctor capability check; label the screen "Preview" so dummy status is explicit to users.
- `P4-T11.5` UI tests: prompt → scripted-response flow, composer state, disclaimer presence.

> **Deferred:** AI Chatbot integration moved to post-MVP Phase 13 (after SATUSEHAT). See [docs/post-mvp/ai-chatbot.md](../post-mvp/ai-chatbot.md).



## 7. Phase 5 - Hardening and Release Readiness (6 Tasks)

1. `P5-T01` Finalize OpenAPI coverage and DTO validation consistency.
2. `P5-T02` Add observability baseline (request IDs, structured logs, audit events).
3. `P5-T03` Add DB migration review checklist and rollback notes template.
4. `P5-T04` Add CI checks for Prisma migrate status and Docker image builds.
5. `P5-T05` Run end-to-end regression pass for MVP flows.
6. `P5-T06` Publish release readiness checklist and deployment runbook.



## 8. Task Definition of Done (DoD)

- Backend tasks: repository + service + controller implemented when applicable.
- Backend validation: shared request schemas live in `packages/shared-types` and are wrapped with `createZodDto(...)` in API DTO classes.
- Backend-first gate: Phase 3 frontend implementation is out of scope until `P3-T07` is complete.
- Frontend tasks (Phase 4): TanStack Query + TanStack Form + Zod integration used where applicable, reusing schemas from `packages/shared-types` when contracts overlap.
- Frontend route/layout files stay server-rendered by default; interactive logic is isolated to `components/client/*`.
- Frontend CASL provider is wired at route/layout or feature-boundary parent; leaf components use shared `Can` wrappers only.
- Frontend API integration is generated/synced from backend OpenAPI YAML via Orval (`react-query` output).
- Frontend screens match the new design (`docs/new-salingjaga-design/`, `DESIGN.md` + screen references) pixel-for-pixel: theme tokens from `P4-T02` only (no ad-hoc hex values in screens), status badges/tables/filters/pagination via the shared compositions, Geist/Inter/Geist Mono typography roles respected (mono for IDs and numeric cells).
- New shadcn primitives are generated into `packages/ui` and consumed via `@hms/ui` exports; screens never hand-roll primitive equivalents; icons only via the shared Material Symbols icon component.
- Dummy data only lives in typed `lib/<feature>/mock-*.ts` modules with a `// DUMMY-DATA:` header documenting the missing backend contract — never inline in components.
- Doctor/patient list contracts use bounded relation summaries; detail contracts and assignment mutations are explicit and documented.
- Storage services remain behind a typed common interface; feature services never import AWS SDK clients directly.
- S3-backed API URLs are always short-lived signed URLs with expiry metadata; only object keys are persisted.
- Tests added at correct level (unit and/or integration).
- Documentation/API contract updated when behavior changes.
- CI passes fully before merge.



## 9. Tooling Compatibility Notes (Latest Stack)

- Prisma v7 (`prisma@7.8.0`, `@prisma/client@7.8.0`) requires adapter-based client and explicit `prisma generate`.
- Tailwind v4 (`tailwindcss@4.3.2`) requires `@tailwindcss/postcss` and `@import "tailwindcss"`.
- shadcn CLI (`shadcn@4.13.0`) monorepo mode requires `components.json` in both `apps/web` and `packages/ui`.
- Orval codegen uses backend OpenAPI YAML contract (`/api/openapi.yaml`) and should regenerate typed hooks before frontend integration PRs.

