# AGENTS.md

This repository is currently empty. Treat this file as the implementation contract for all future AI coding sessions.

## 1) Product Scope (MVP First)

Build a scalable Health Management System (HMS) for hospitals/clinics, but deliver MVP features first:

- Admin Management
- Patient Management
- Doctor Management
- Appointment Management
- Registration Flow
- Pharmacy Flow
- AI Chatbot Integration

Do not expand scope (billing, insurance, EMR interoperability, telemedicine, advanced analytics) until MVP modules are stable.

## 2) Mandatory Tech Stack

- Backend: Node.js + TypeScript + NestJS
- Frontend: React.js + Next.js (App Router)
- Database: PostgreSQL + Prisma ORM
- Infra: Docker + Docker Compose
- CI/CD: GitHub Actions
- AuthN/AuthZ: JWT-based auth + RBAC
- Request validation (Backend): Zod + `nestjs-zod`

If proposing alternatives, keep compatibility with this stack and justify in PR notes.

## 3) Target Architecture

Use a modular monolith for MVP (clear domain boundaries, single deployable backend), designed to split into services later.

- `apps/api`: NestJS API
- `apps/web`: Next.js frontend
- `packages/shared-types`: shared Zod schemas + inferred DTO/types for API and frontend forms
- `packages/config`: shared lint/tsconfig/prettier presets
- `infra/docker`: Dockerfiles + compose files
- `infra/github`: reusable CI workflow templates (optional if using `.github/workflows` only)

Inside `apps/api`, enforce Clean Architecture per module:

- `domain`: entities, value objects, domain services, repository interfaces
- `application`: use cases, commands/queries, DTO contracts
- `infrastructure`: Prisma adapters, external providers, persistence mappings
- `presentation`: Nest controllers, request/response mappers

Do not let controllers call Prisma directly.

## 4) Domain Modules and Ownership

Create backend modules with strict boundaries:

- `auth`
- `users`
- `admin-management`
- `patient-management`
- `doctor-management`
- `appointment-management`
- `registration-flow`
- `pharmacy-flow`
- `ai-chatbot`

Cross-module access must go through application services/interfaces, not direct repository access across modules.

`ai-chatbot` is an integration module: it must call an existing external production AI service and must not run local model inference.

## 5) Database Design Guidelines (PostgreSQL + Prisma)

Core MVP entities (minimum):

- `User`, `Role`, `Permission`, `UserRole`
- `PatientProfile`
- `DoctorProfile`, `DoctorSchedule`
- `Appointment`
- `Registration`
- `Medication`, `Prescription`, `DispenseRecord`
- `ChatSession`, `ChatMessage` (AI auditability)

Rules:

- Use UUID primary keys.
- Add `createdAt`, `updatedAt`, optional `deletedAt` (soft delete where needed).
- Use explicit enums for status fields (appointment, registration, prescription lifecycle).
- Add unique constraints for medical identifiers where applicable.
- Index all foreign keys and common filter columns (`status`, `scheduledAt`, `doctorId`, `patientId`).
- Never store plain secrets/tokens in DB.
- Keep Prisma migrations small and reversible; one concern per migration.

## 6) RBAC Strategy (Required)

Default MVP roles:

- `SUPER_ADMIN`
- `ADMIN`
- `DOCTOR`
- `PHARMACIST`
- `PATIENT`

Guidelines:

- Enforce auth in Nest guards; enforce authorization via permission checks, not role-name checks in controllers.
- Standardize authorization implementation with CASL (`@casl/ability`) in backend guard/service layers.
- Register authn/authz guards globally via `APP_GUARD` in a shared authorization module; avoid repeated per-feature guard provider wiring.
- Permissions should be action-based (example: `appointment.read:any`, `appointment.read:own`, `prescription.write:any`).
- Support resource ownership checks (`:own`) for patient/doctor data.
- Deny by default.

Frontend requirement:

- Implement frontend capability checks using CASL (`@casl/ability` + `@casl/react`) for route and component visibility.
- Frontend CASL is UX guidance only; backend guard/policy remains source of truth.

## 7) API Conventions

- Prefix all routes with `/api/v1`.
- REST-first design; keep endpoints resource-oriented.
- Validate all request payloads with Zod DTOs using `nestjs-zod`.
- Source all reusable request schemas from `packages/shared-types` and consume them in backend DTO wrappers (`createZodDto(...)`).
- Return consistent response envelope:
  - success: `{ data, meta?, message? }`
  - error: `{ error: { code, message, details? } }`
- Use cursor or page-based pagination consistently per resource.
- Generate and expose OpenAPI docs from code annotations.
- Never expose internal stack traces in production responses.

## 8) Backend Conventions (NestJS)

- Strict TypeScript (`"strict": true`) and no `any` in domain/application layers.
- Use case classes should contain business logic; controllers stay thin.
- Repositories are interfaces in `domain`/`application`, implementations in `infrastructure`.
- Use transaction boundaries for multi-write operations (appointments, registration, pharmacy dispensing).
- Centralize config via Nest config module and `.env` schema validation.
- Use `ConfigService` for runtime env access in providers/services; avoid direct `process.env` in service logic.
- Add structured logging with request IDs.

## 9) Frontend Conventions (Next.js)

- Use App Router with feature-based folders.
- Keep server/client boundaries explicit (`use client` only when necessary).
- Use typed API client shared with backend contracts.
- Guard private routes by role and auth state.
- Build reusable form components with schema validation.
- Do not encode business rules only in UI; backend remains source of truth.

## 10) AI Chatbot Boundaries (MVP)

Integration mode (required):

- Use the backend as an API gateway/orchestrator to an external production-ready AI chatbot service.
- Persist local chat audit records (`ChatSession`, `ChatMessage`) for traceability.
- Do not build or host a new model-serving stack in this repository.

Allowed:

- Patient FAQ for hospital/clinic operations
- Appointment guidance
- General non-diagnostic health information
- Doctor support: literature lookup, research summarization, clinical reference search

Forbidden:

- Diagnosis
- Treatment prescription generation without clinician control
- Any output framed as replacing professional medical judgment

Implementation constraints:

- Call external AI service through a dedicated infrastructure adapter with timeout/retry/circuit-breaker policy.
- Store provider request/response metadata (request IDs, provider message IDs when available).
- Persist prompts/responses with audit metadata.
- Add clear disclaimer text in API/UI responses.
- Add rate limits and basic abuse protection.

## 11) CI/CD Workflow (GitHub Actions)

Every PR pipeline should run in this order:

1. Install dependencies (with cache)
2. Lint
3. Typecheck
4. Unit tests
5. Integration tests (DB-dependent)
6. Build

Required checks before merge:

- Prisma schema validate + migration status check
- No high-severity dependency vulnerabilities
- Docker image build success for API and Web

## 12) Docker/Compose Setup

Provide at minimum:

- `postgres` service with persistent volume
- `api` service
- `web` service

Rules:

- Use healthchecks and dependency readiness (do not rely on startup timing).
- Run migrations as explicit step/command, not implicit side effect of container boot.
- Keep dev and prod Dockerfiles separate when optimization differs.

## 13) Git Workflow

- Branch naming: `feature/<module>-<short-desc>`, `fix/<module>-<short-desc>`, `chore/<short-desc>`
- Commit format: Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`...)
- PR must include: scope, module(s) affected, migration impact, test evidence, and rollback notes if relevant.
- Keep PRs focused to one module/use-case whenever possible.

## 14) Engineering Principles for Agents

- MVP-first, but code must be production-grade (typed, tested, observable).
- Prefer explicitness over magic; avoid hidden coupling across modules.
- Keep PII exposure minimal; never log sensitive medical details unnecessarily.
- Add tests with each feature: unit tests for use cases, integration tests for critical flows.
- When uncertain, choose simpler architecture that preserves clean boundaries.

## 15) Suggested MVP Delivery Order

1. Foundation: repo scaffolding, auth, RBAC, shared configs, CI, Docker
2. Patient + Doctor + Admin management modules
3. Appointment management
4. Registration flow
5. Pharmacy flow
6. AI chatbot integration (external service gateway) with strict safety boundaries

Do not start AI chatbot before auth/RBAC/audit logging are in place.
