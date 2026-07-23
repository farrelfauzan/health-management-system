# HMS Architecture

## 1. Architecture Goals

- Deliver MVP quickly without sacrificing production quality.
- Keep strong module boundaries so the backend can split into services later.
- Standardize developer workflow with a single monorepo toolchain.
- Enforce backend-first delivery for clinical modules before frontend integration.

## 2. Monorepo and Workspace (Mandatory)

This repository must use a **pnpm workspace** monorepo.

Planned structure:

```text
.
|- apps/
|  |- api/                     # NestJS API
|  |- web/                     # Next.js App Router frontend
|- packages/
|  |- shared-types/            # Shared Zod schemas + inferred types
|  |- config/                  # Shared tsconfig/eslint/prettier presets
|  |- ui/                      # Optional shared UI primitives
|- infra/
|  |- docker/                  # Dockerfiles + compose
|  |- github/                  # Optional reusable CI templates
|- docs/
|- AGENTS.md
|- pnpm-workspace.yaml
|- package.json                # Root scripts + workspace orchestration
```

Workspace policy:

- Use `pnpm` for all package management and scripts.
- Keep app-specific dependencies inside app packages.
- Keep cross-cutting contracts/utilities in `packages/*`.

Runtime baseline:

- Node.js `>= 20.19.0` (Prisma v7 minimum).
- TypeScript `>= 5.4.0`.
- Prefer ESM-compatible package setup in workspaces that run Prisma v7.

## 3. Backend (NestJS) Architecture

`apps/api` follows modular monolith with a mandatory 3-layer module structure:

- `repository`: ORM/query layer to PostgreSQL via Prisma.
- `service`: business process layer (validation, policies, orchestration, transactions).
- `controller`: API exposure layer (routes, DTO mapping, guards/interceptors).

Prisma policy:

- Use Prisma ORM **latest stable** (currently `prisma@7.8.0` + `@prisma/client@7.8.0`).
- Implement Prisma v7 with driver adapters (`@prisma/adapter-pg` + `pg`) and generated client output.

Suggested module layout:

```text
apps/api/src/modules/<module>/
|- repository/
|- service/
|- controller/
```

Common storage layout:

```text
apps/api/src/common/storage/
|- object-storage.service.ts  # Injectable provider-neutral typed contract
|- storage.types.ts           # Upload/get/signed-URL/delete input and output types
|- s3-storage.service.ts      # AWS S3-compatible infrastructure adapter
|- storage.module.ts          # Provider-token registration and export
```

Domain modules:

- `auth`, `users`, `admin-management`, `patient-management`, `doctor-management`, `appointment-management`, `registration-flow`, `pharmacy-flow`.
- `appointment-management` owns the session-based scheduling model (see [docs/revamp/appointment-scheduling.md](../revamp/appointment-scheduling.md)): a primary appointments controller plus a secondary `AppointmentSession` controller (doctor session projection, cross-doctor calendar listing, queue, capacity/status management). The registration flow assigns session queue numbers at check-in.
- `ai-chatbot` (post-MVP Phase 13 — see [docs/post-mvp/ai-chatbot.md](../post-mvp/ai-chatbot.md)).

AI chatbot module strategy (post-MVP):

- `ai-chatbot` acts as an integration gateway to your existing production AI chatbot service.
- No local model hosting or inference is implemented in this repository.
- Integration lives in backend repository/service layers via dedicated provider adapter.

Boundary rules:

- Controllers never call Prisma directly.
- Repositories never contain business rules.
- Services are the only layer that can orchestrate repositories.
- Cross-module calls go through service interfaces, not direct repository access.
- Validate API input DTOs with Zod + `nestjs-zod` (not class-validator).
- Keep reusable request schemas in `packages/shared-types`; backend DTO classes wrap them with `createZodDto(...)`.
- Register authorization guards globally with `APP_GUARD` (JWT first, permissions second) in a shared authorization module.
- Keep `Auth(...)` decorator metadata-focused (permissions/public route), not guard-instantiation focused.
- Read runtime env values through Nest `ConfigService`; avoid direct `process.env` reads in providers/services.
- Keep AWS SDK clients inside the common storage adapter. `StorageModule` exports the object-storage provider so any feature service that owns files can inject the provider-neutral contract.
- Object storage has no generic controller or standalone upload API. Each feature module owns its file endpoints and orchestrates storage through the injected provider.
- Keep the object bucket private, persist object keys and durable metadata only, and generate temporary signed URLs on demand.
- Every API field that represents an S3-backed URL must contain a short-lived signed URL with expiry metadata. Never return object keys, permanent S3 URLs, or unsigned bucket URLs.
- Validate storage region, bucket, optional S3-compatible endpoint, credential provider, request timeout, signed-URL expiry, object-size limit, and MIME allowlist through typed configuration.
- Do not log credentials, signed URLs, object bytes, or user PII; log only safe operation identifiers and provider request IDs.
- Patient and doctor services own many-to-many assignment orchestration; repositories query the explicit `DoctorPatient` junction and never infer assignments from appointments.
- Doctor `:own` patient access is constrained by an active doctor-patient assignment at repository query level.
- Doctor-patient assignment history retains every relationship lifecycle, while an append-only activity model records assign/unassign actors and timestamps for permission-protected, filterable audit queries.

## 4. Frontend (Next.js) Architecture

`apps/web` uses App Router with feature-based folders.

Phase gating (mandatory):

- Clinical module frontend integration starts only after backend readiness gate completion.
- Backend readiness gate includes stable OpenAPI contracts, RBAC coverage, and passing backend validation pipeline.

Required client data/form stack:

- **TanStack Query** for API data fetching, caching, retries, and mutations.
- **@tanstack/react-form** for form state and submission lifecycle.
- **Zod** for schema validation (shared with API contracts where possible).

Required styling/component stack:

- **Tailwind CSS latest stable** (currently `tailwindcss@4.3.2`).
- **shadcn/ui latest CLI** (currently `shadcn@4.13.0`) with monorepo-aware setup.
- Shared UI components should live in `packages/ui` and be consumed from `apps/web`.
- Keep `components.json` in both `apps/web` and `packages/ui` for shadcn monorepo routing.

Integration rules:

- Query keys are feature-scoped and deterministic.
- `app/layout.tsx` and `app/**/page.tsx` should remain server components by default.
- Keep interactive logic in `components/client/*`; keep server composition/presentation in `components/server/*`.
- Server-side auth/role checks guard routes; UI checks are secondary.
- Use `proxy.ts` (Next.js proxy convention) for protected route boundary checks before route render.
- Build CASL ability/rules on the server boundary (layout/page) from validated claims/profile payload, run a server-side capability gate, then pass serializable rules into a single client provider at that boundary.
- Leaf feature components must consume shared `Can`/ability hooks and must not define local CASL providers.
- Prefer importing form/request schemas from `packages/shared-types`; compose feature-local UI-only refinements only when needed.
- Generate frontend API clients/hooks from backend OpenAPI contract (`/api/openapi.yaml`) using Orval with `react-query` output.
- Use axios-based centralized HTTP client/interceptor for auth header injection and 401 handling in frontend API calls.
- Use shadcn monorepo aliases so app imports UI via workspace package exports.
- For Tailwind v4, use `@tailwindcss/postcss` plugin and `@import "tailwindcss"` in global CSS.

Versioning rule:

- Pin exact versions for Prisma/Tailwind/shadcn in lockfile updates and upgrade intentionally.

## 5. Cross-Cutting Architecture

- AuthN/AuthZ: JWT + RBAC with action-based permissions.
- API prefix: `/api/v1`.
- Response envelope:
  - success: `{ data, meta?, message? }`
  - error: `{ error: { code, message, details? } }`
- Observability: structured logs + request IDs.
- Data layer: PostgreSQL + Prisma with explicit migrations.
- AI integration: outbound HTTP client with timeout/retry/circuit-breaker and provider metadata auditing.
- Object storage: private S3-compatible bucket behind an injectable NestJS common provider with upload, get, signed-URL, and idempotent delete operations; domain modules own all public file workflows.
- Clinical relationships: explicit `DoctorPatient` junction with retained assignment lifecycles, append-only assignment activities, service-owned transaction boundaries, activity-log reads, and bounded relation projections.

## 6. Deployment Topology (MVP)

- `postgres` container
- `api` container
- `web` container

Compose must use healthchecks and explicit migration execution.

S3 is an external managed dependency for production. Local development may use an S3-compatible emulator through configuration, but application code must use the same provider-neutral storage contract in every environment.
