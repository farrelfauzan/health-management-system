# HMS Architecture

## 1. Architecture Goals

- Deliver MVP quickly without sacrificing production quality.
- Keep strong module boundaries so the backend can split into services later.
- Standardize developer workflow with a single monorepo toolchain.

## 2. Monorepo and Workspace (Mandatory)

This repository must use a **pnpm workspace** monorepo.

Planned structure:

```text
.
|- apps/
|  |- api/                     # NestJS API
|  |- web/                     # Next.js App Router frontend
|- packages/
|  |- shared-types/            # Shared DTO/types only
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

Domain modules:

- `auth`, `users`, `admin-management`, `patient-management`, `doctor-management`, `appointment-management`, `registration-flow`, `pharmacy-flow`, `ai-chatbot`.

AI chatbot module strategy:

- `ai-chatbot` acts as an integration gateway to your existing production AI chatbot service.
- No local model hosting or inference is implemented in this repository.
- Integration lives in backend repository/service layers via dedicated provider adapter.

Boundary rules:

- Controllers never call Prisma directly.
- Repositories never contain business rules.
- Services are the only layer that can orchestrate repositories.
- Cross-module calls go through service interfaces, not direct repository access.

## 4. Frontend (Next.js) Architecture

`apps/web` uses App Router with feature-based folders.

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
- Server-side auth/role checks guard routes; UI checks are secondary.
- Form schemas live near feature code, and map to backend DTO contracts.
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

## 6. Deployment Topology (MVP)

- `postgres` container
- `api` container
- `web` container

Compose must use healthchecks and explicit migration execution.
