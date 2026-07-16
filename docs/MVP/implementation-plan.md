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

## 3. Phase 1 - Foundation and Tooling (10 Tasks)

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

- `P3-T02.1` Define shared patient DTO schemas (create/update/search/detail).
- `P3-T02.2` Implement repository queries with `deletedAt` filtering and pagination.
- `P3-T02.3` Implement service validation (MRN uniqueness, identity constraints, ownership scope behavior).
- `P3-T02.4` Implement REST endpoints with permission checks (`patient.read:any|own`, `patient.create:any`, update rules).
- `P3-T02.5` Add tests for ownership/access combinations and validation errors.

### 5.3 Doctor Management (`P3-T03`)

- `P3-T03.1` Define doctor profile/schedule DTO schemas in shared-types.
- `P3-T03.2` Implement doctor repository methods (profile CRUD + schedule read/write).
- `P3-T03.3` Add service rules for schedule overlaps and ownership writes.
- `P3-T03.4` Implement endpoints and CASL permission checks for schedule operations.
- `P3-T03.5` Add tests for schedule conflict detection and own-vs-any authorization.

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

## 6. Phase 4 - AI Chatbot External Integration (8 Tasks, Backend)

Goal: integrate existing production AI chatbot service through HMS backend gateway.

1. `P4-T01` Create `ai-chatbot` module skeleton (repository/service/controller).
2. `P4-T02` Implement provider adapter for external AI service API calls.
3. `P4-T03` Add resilience policy (timeout, retry, circuit breaker) and upstream error mapping.
4. `P4-T04` Implement chat session/message APIs with HMS response envelope.
5. `P4-T05` Persist chat audit records and provider metadata (`requestId`, `messageId`, latency, status).
6. `P4-T06` Add safety policy and disclaimer injection to responses.
7. `P4-T07` Add abuse controls (rate limit, input guards, payload limits).
8. `P4-T08` Add integration tests with provider mock contract.

## 7. Phase 5 - Frontend Integration (Backend-Ready First, 6 Tasks + Module Subtasks)

Goal: implement frontend features only after backend APIs for MVP modules are stable.

Frontend start criteria:

- `P3-T07` completed.
- Contracts for target backend module are stable (OpenAPI exported and shared schema aligned).

1. `P5-T01` Admin management frontend screens/forms.
2. `P5-T02` Patient management frontend screens/forms.
3. `P5-T03` Doctor management frontend screens/forms.
4. `P5-T04` Appointment management frontend screens/forms.
5. `P5-T05` Registration flow frontend screens/forms.
6. `P5-T06` Pharmacy flow frontend screens/forms.

Execution strategy by module:

### 7.1 Admin Management (`P5-T01`)

- `P5-T01.1` Build admin list/detail pages with server-side route capability checks and boundary-level CASL provider wiring.
- `P5-T01.2` Build create/update admin forms using shared Zod schemas.
- `P5-T01.3` Implement TanStack Query hooks (list/detail/create/update/invalidate).
- `P5-T01.4` Wire role-select UI from `GET /api/v1/rbac/roles`.
- `P5-T01.5` Add UI tests for access-guarded actions and mutation error states.

### 7.2 Patient Management (`P5-T02`)

- `P5-T02.1` Build patient table/search/filter UI.
- `P5-T02.2` Build patient create/edit forms with shared schema validation.
- `P5-T02.3` Add patient detail page with role-aware sections/actions.
- `P5-T02.4` Add optimistic/invalidated query flows for create/update.
- `P5-T02.5` Add UI tests for role-based visibility and form validation.

### 7.3 Doctor Management (`P5-T03`)

- `P5-T03.1` Build doctor directory/listing screens.
- `P5-T03.2` Build doctor profile and schedule management forms.
- `P5-T03.3` Implement doctor schedule calendar/time-slot interaction UX.
- `P5-T03.4` Add guarded actions for doctor-own schedule edits.
- `P5-T03.5` Add UI tests for conflict feedback and permission-aware controls.

### 7.4 Appointment Management (`P5-T04`)

- `P5-T04.1` Build appointment list/calendar views with filter controls.
- `P5-T04.2` Build appointment booking and update forms.
- `P5-T04.3` Implement cancel and reschedule flows with optimistic invalidation.
- `P5-T04.4` Apply capability checks for patient/doctor/admin action variants.
- `P5-T04.5` Add UI tests for lifecycle transitions and guarded actions.

### 7.5 Registration Flow (`P5-T05`)

- `P5-T05.1` Build registration queue/list views.
- `P5-T05.2` Build registration create and status update interactions.
- `P5-T05.3` Add patient self-service registration pages.
- `P5-T05.4` Add role-based action gating for admin/doctor/patient flows.
- `P5-T05.5` Add UI tests for status transitions and constraints.

### 7.6 Pharmacy Flow (`P5-T06`)

- `P5-T06.1` Build medication catalog and prescription creation screens.
- `P5-T06.2` Build dispense workflow UI for pharmacists.
- `P5-T06.3` Show prescription lifecycle timeline/status updates.
- `P5-T06.4` Add role-based controls for doctor vs pharmacist actions.
- `P5-T06.5` Add UI tests for dispense flow and failure recovery.

## 8. Phase 6 - Hardening and Release Readiness (6 Tasks)

1. `P6-T01` Finalize OpenAPI coverage and DTO validation consistency.
2. `P6-T02` Add observability baseline (request IDs, structured logs, audit events).
3. `P6-T03` Add DB migration review checklist and rollback notes template.
4. `P6-T04` Add CI checks for Prisma migrate status and Docker image builds.
5. `P6-T05` Run end-to-end regression pass for MVP flows.
6. `P6-T06` Publish release readiness checklist and deployment runbook.

## 9. Task Definition of Done (DoD)

- Backend tasks: repository + service + controller implemented when applicable.
- Backend validation: shared request schemas live in `packages/shared-types` and are wrapped with `createZodDto(...)` in API DTO classes.
- Backend-first gate: Phase 3 frontend implementation is out of scope until `P3-T07` is complete.
- Frontend tasks (Phase 5): TanStack Query + TanStack Form + Zod integration used where applicable, reusing schemas from `packages/shared-types` when contracts overlap.
- Frontend route/layout files stay server-rendered by default; interactive logic is isolated to `components/client/*`.
- Frontend CASL provider is wired at route/layout or feature-boundary parent; leaf components use shared `Can` wrappers only.
- Frontend API integration is generated/synced from backend OpenAPI YAML via Orval (`react-query` output).
- Tests added at correct level (unit and/or integration).
- Documentation/API contract updated when behavior changes.
- CI passes fully before merge.

## 10. Tooling Compatibility Notes (Latest Stack)

- Prisma v7 (`prisma@7.8.0`, `@prisma/client@7.8.0`) requires adapter-based client and explicit `prisma generate`.
- Tailwind v4 (`tailwindcss@4.3.2`) requires `@tailwindcss/postcss` and `@import "tailwindcss"`.
- shadcn CLI (`shadcn@4.13.0`) monorepo mode requires `components.json` in both `apps/web` and `packages/ui`.
- Orval codegen uses backend OpenAPI YAML contract (`/api/openapi.yaml`) and should regenerate typed hooks before frontend integration PRs.
