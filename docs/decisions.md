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

## D-007: AI Chatbot Scope Limitation

- **Status:** Accepted
- **Decision:** Keep AI chatbot MVP limited to FAQ/guidance/research support, exclude diagnosis, and integrate only through an existing external production AI service.
- **Why:** Reduce clinical risk and delivery complexity in MVP.
- **Consequence:** Mandatory disclaimers, audit logs, abuse protections, provider adapter resilience (timeout/retry/circuit-breaker), and no local model-serving implementation.

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
