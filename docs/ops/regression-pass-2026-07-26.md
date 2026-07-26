# MVP Regression Pass — 2026-07-26

Final Definition of Done verification for the MVP implementation on `main` at `fb51b3b`, including the runtime and dependency fixes discovered during the pass.

## Results

- Lint: passed across all workspaces with zero errors and two existing `no-explicit-any` test warnings.
- Typecheck: passed across all workspaces.
- API tests: 25 suites and 266 tests passed.
- Web tests: 50 files and 214 tests passed.
- Integration tests: 7 suites and 74 tests passed.
- Production build: API, web, shared types, and UI packages passed.
- Production API smoke test: `GET /api/v1/health` returned `200` with `X-Request-Id`.
- OpenAPI contract: exported from the running production build and regenerated through Orval without contract drift.
- Prisma: schema valid, 12 migrations applied, migration status clean, no schema drift, and seed completed.
- Docker: API and web builds completed dependency installation and image layers, but final image export was blocked by exhausted Docker Desktop disk capacity. Rerun both image builds after local disk cleanup or in CI.
- Dependency audit: `pnpm audit --audit-level high` exited successfully after direct dependency upgrades and transitive overrides.

## Fixes Found During the Pass

- Corrected the API production entry point from `dist/main.js` to `dist/src/main.js`.
- Added a CommonJS runtime bundle for `@hms/shared-types` while preserving direct TypeScript source consumption for the web application.
- Mapped `@hms/shared-types` to source in Jest so tests do not depend on prebuilt package artifacts.
- Upgraded affected NestJS, Next.js, Orval, PostCSS, and build-tool dependencies.

## Security Audit Waiver

`GHSA-mh99-v99m-4gvg` remains reported against `brace-expansion` through `@nestjs/cli` and `@swc/cli`. Both paths are development-only build tools, receive only repository-controlled glob patterns, and are not present in the application request path. The advisory is ignored in pnpm audit configuration until those upstream tools adopt `brace-expansion` 5.0.8 or a compatible backport.

## Operational Sign-Off Still Required

All code gates passed before the final Orval 8.23 regeneration. CI must rerun against the final generated client, and the Docker image export must be retried after disk cleanup. Release-time items still require the deployment owner: production backup or restore point, production environment values, staging audit-log verification, log-alert routing, release notes, deployment window, and named post-deploy verifier.
