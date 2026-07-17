# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Contract

**Read [AGENTS.md](AGENTS.md) first** — it is the implementation contract for this repo: product scope (MVP modules), mandatory tech stack, RBAC strategy, API conventions, AI-chatbot boundaries, and delivery order. Design docs live in `docs/MVP/` (architecture, database, rbac, api-contract, implementation-plan, decisions).

NestJS/TypeScript style rules (explicit types everywhere, one export per file, kebab-case files, verb-prefixed function names, no `any`) are always in force:

@.claude/rules/nestjs-clean-typescript.md

The same rules exist for Cursor at `.cursor/rules/*.mdc`; project skills are mirrored in `.claude/skills/` (api-integration, pr, commit-push) and `.cursor/skills/` — keep both copies in sync when editing either.

## Workspace Layout

pnpm monorepo (Node ≥ 20.19, pnpm ≥ 10):

- `apps/api` — NestJS 11 API (`@hms/api`), Prisma 7 + PostgreSQL
- `apps/web` — Next.js 16 App Router frontend (`@hms/web`), React 19, TanStack Query, Tailwind 4
- `packages/shared-types` — Zod schemas shared by API and web (`@hms/shared-types`); consumed directly as TypeScript source via `#module/schemas` import aliases
- `packages/config` — shared lint/tsconfig/prettier presets
- `infra/docker` — Dockerfiles + `docker-compose.dev.yml` (postgres, api, web, and a `migrate` service under the `tools` profile)

## Commands

All from the repo root. Root scripts fan out with `pnpm -r --if-present`; scope to one package with `pnpm --filter @hms/api <script>`.

```bash
pnpm dev                 # run all dev servers (api on :3001, web via next dev)
pnpm lint                # eslint across workspaces
pnpm typecheck           # tsc --noEmit across workspaces
pnpm build               # build all packages
pnpm test                # jest unit tests (api), --runInBand
pnpm integration:test    # jest *.integration.spec.ts only — needs postgres + DATABASE_URL
```

Single test file / single test name (API):

```bash
pnpm --filter @hms/api exec jest --config ./jest.config.cjs src/common/authorization/permissions.guard.spec.ts
pnpm --filter @hms/api exec jest --config ./jest.config.cjs -t "test name"
```

Database (Prisma, all proxied to `@hms/api`):

```bash
pnpm docker:dev:up       # start postgres (hms_dev, postgres/postgres on :5432)
pnpm db:generate         # prisma generate → apps/api/src/generated/prisma
pnpm db:migrate:dev      # create/apply dev migration
pnpm db:seed             # runs prisma db seed (seed.sql: roles/permissions baseline)
pnpm db:validate         # schema validate (CI-required)
```

API↔web contract sync (API must be running on :3001 first):

```bash
pnpm api:contract:sync   # curl /api/openapi.yaml → apps/api/openapi.yaml, then Orval codegen into apps/web/lib/api/generated
```

Copy `apps/api/.env.example` to `apps/api/.env` for local dev (DATABASE_URL, JWT secrets/expiries).

## Architecture

### API (`apps/api`)

- Each domain module under `src/modules/<name>/` follows the same internal layout: `controller/`, `service/`, `repository/`, `dto/`. Controllers stay thin; business logic lives in services; only repositories touch Prisma. Cross-module access goes through services, never another module's repository.
- Existing modules: `auth`, `rbac`, `admin-management`, `patient-management`, `health`. Remaining MVP modules (doctor, appointment, registration, pharmacy, ai-chatbot) follow the same pattern.
- `src/common/` holds the cross-cutting infrastructure:
  - `prisma/` — `PrismaService` (global module). Prisma client is **generated into `src/generated/prisma`** (not `node_modules`), so `pnpm db:generate` must run after schema changes or fresh installs.
  - `auth/` — JWT guard, `@AuthUser()` decorator, current-user type.
  - `authorization/` — CASL `AbilityFactory` + `PermissionsGuard`, wired globally via `AuthorizationModule` (`APP_GUARD`). Routes declare requirements with `@CheckPermissions()` / combined `@Auth()` decorators; opt out with `@PublicRoute()`. Permissions are action-based with scope: e.g. `patient.read` with scope `ANY` or `OWN` (deny by default).
- DTOs wrap shared Zod schemas from `@hms/shared-types` using `createZodDto(...)` (nestjs-zod); a global `ZodValidationPipe` enforces them. Don't define request schemas inline in the API — put them in `packages/shared-types` and wrap them.
- Routes are `/api/v1/...` (global prefix + URI versioning). Swagger UI at `/api/docs`; the OpenAPI YAML served at `/api/openapi.yaml` is the frontend integration contract.
- Response envelope: success `{ data, meta?, message? }`, error `{ error: { code, message, details? } }`.
- Prisma schema conventions: UUID PKs, snake_case `@map` names, `createdAt`/`updatedAt`/`deletedAt` (soft delete), explicit status enums, indexed FKs.
- Tests live next to code: `*.spec.ts` for unit, `<module>.integration.spec.ts` (supertest, real DB) at module root.

### Web (`apps/web`)

- API access is **generated, never hand-written**: Orval reads `apps/api/openapi.yaml` and emits a TanStack Query client into `lib/api/generated/` (tags-split mode, axios mutator at `lib/api/http.ts` for auth headers/401 handling). Never edit generated files, never call `fetch`/axios directly in features — regenerate with `pnpm api:contract:sync` when the API changes. See `.cursor/skills/api-integration/SKILL.md`.
- App Router, SSR-first: route files stay server components; interactive logic goes in `components/client/`, server composition in `components/server/`. Feature logic under `lib/<feature>/` (e.g. `lib/auth`, `lib/rbac`, `lib/admin-users`).
- Frontend capability checks use CASL (`lib/rbac`) for visibility only — the backend guard remains the source of truth.
- Path aliases via package `imports`: `#components/*`, `#hooks/*`, `#lib/*`.

## CI

`.github/workflows/ci.yml` runs on every PR: install → lint → typecheck → unit tests → integration tests (postgres service container) → build → prisma validate → API & web docker builds. All must pass before merge.

## Git Conventions

- Branches: `feature/<module>-<short-desc>`, `fix/<module>-<short-desc>`, `chore/<short-desc>`.
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:` …).
- Keep PRs scoped to one module/use-case; note migration impact in the PR description.
