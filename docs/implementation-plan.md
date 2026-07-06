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
4. `P2-T04` Implement permission guard (`resource.action:scope`) and route decorators.
5. `P2-T05` Implement IAM-style role assignment/unassignment flow for admins.
6. `P2-T06` Implement ownership policy checks for `:own` resources.
7. `P2-T07` Add auth and RBAC seeders for MVP roles and baseline permissions.
8. `P2-T08` Add unit/integration tests for auth + RBAC critical paths.

## 5. Phase 3 - Core Clinical Modules (12 Tasks)

Goal: deliver MVP business modules in priority order.

1. `P3-T01` Admin management backend module + APIs.
2. `P3-T02` Admin management frontend screens/forms.
3. `P3-T03` Patient management backend module + APIs.
4. `P3-T04` Patient management frontend screens/forms.
5. `P3-T05` Doctor management backend module + APIs.
6. `P3-T06` Doctor management frontend screens/forms.
7. `P3-T07` Appointment management backend module + APIs.
8. `P3-T08` Appointment management frontend screens/forms.
9. `P3-T09` Registration flow backend module + APIs.
10. `P3-T10` Registration flow frontend screens/forms.
11. `P3-T11` Pharmacy flow backend module + APIs.
12. `P3-T12` Pharmacy flow frontend screens/forms.

## 6. Phase 4 - AI Chatbot External Integration (8 Tasks)

Goal: integrate existing production AI chatbot service through HMS backend gateway.

1. `P4-T01` Create `ai-chatbot` module skeleton (repository/service/controller).
2. `P4-T02` Implement provider adapter for external AI service API calls.
3. `P4-T03` Add resilience policy (timeout, retry, circuit breaker) and upstream error mapping.
4. `P4-T04` Implement chat session/message APIs with HMS response envelope.
5. `P4-T05` Persist chat audit records and provider metadata (`requestId`, `messageId`, latency, status).
6. `P4-T06` Add safety policy and disclaimer injection to responses.
7. `P4-T07` Add abuse controls (rate limit, input guards, payload limits).
8. `P4-T08` Add integration tests with provider mock contract.

## 7. Phase 5 - Hardening and Release Readiness (6 Tasks)

1. `P5-T01` Finalize OpenAPI coverage and DTO validation consistency.
2. `P5-T02` Add observability baseline (request IDs, structured logs, audit events).
3. `P5-T03` Add DB migration review checklist and rollback notes template.
4. `P5-T04` Add CI checks for Prisma migrate status and Docker image builds.
5. `P5-T05` Run end-to-end regression pass for MVP flows.
6. `P5-T06` Publish release readiness checklist and deployment runbook.

## 8. Task Definition of Done (DoD)

- Backend tasks: repository + service + controller implemented when applicable.
- Frontend tasks: TanStack Query + TanStack Form + Zod integration used where applicable.
- Tests added at correct level (unit and/or integration).
- Documentation/API contract updated when behavior changes.
- CI passes fully before merge.

## 9. Tooling Compatibility Notes (Latest Stack)

- Prisma v7 (`prisma@7.8.0`, `@prisma/client@7.8.0`) requires adapter-based client and explicit `prisma generate`.
- Tailwind v4 (`tailwindcss@4.3.2`) requires `@tailwindcss/postcss` and `@import "tailwindcss"`.
- shadcn CLI (`shadcn@4.13.0`) monorepo mode requires `components.json` in both `apps/web` and `packages/ui`.
