# MVP Regression Pass — 2026-07-25 (P5-T05)

Full quality-gate regression run for Phase 5 release readiness. All gates executed locally against the migrated dev database (12 migrations applied, no drift), mirroring the CI pipeline in `.github/workflows/ci.yml`.

## Baseline

- Branch: `main` at `d7a9591` (post P4-T11, all MVP modules merged).
- Also verified independently on the pending Phase 5 branches before their PRs were opened: P5-T01 (#31), P5-T02 (#32), P5-T03 (#29), P5-T04 (#30).

## Results

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `pnpm lint` | ✅ 0 errors (2 pre-existing warnings in `permissions.guard.spec.ts`) |
| Typecheck | `pnpm typecheck` | ✅ clean across all 4 workspaces |
| API unit + integration tests | `jest --runInBand` (all `*.spec.ts`) | ✅ 20/20 suites, 252/252 tests |
| Web tests | `pnpm --filter @hms/web test` (vitest) | ✅ 50/50 files, 214/214 tests |
| Build | `pnpm build` | ✅ all workspaces incl. Next.js production build |
| Prisma schema | `prisma validate` + `migrate status` + `migrate diff --exit-code` | ✅ valid, fully applied, no drift |
| OpenAPI contract | `phase-three-readiness.spec.ts` against `apps/api/openapi.yaml` | ✅ every MVP endpoint documented with permission metadata |

With the P5-T01 and P5-T02 branches applied, the API suite grows to 25 suites / 265 tests — also fully green, plus a live smoke test of request-id propagation and error envelopes on a built binary.

## MVP flows covered by the integration suites (supertest over `AppModule`)

- Auth + RBAC: bearer guard (401), permission guard (403), role listing (200), deleted-user token rejection.
- Patient management: list/detail/create/update with permission scoping.
- Doctor management: list/detail/create, schedule update.
- Doctor-patient assignment: assign, duplicate-assign idempotency, unassign, activity log permissions.
- Appointment management: session-based create/list/detail/update, approve/reject/cancel transitions.
- Registration flow: list/detail/create/update with status transitions.
- Pharmacy flow: medications list, prescription create, dispense create.

## Known caveats

- Local runs need `JWT_ACCESS_SECRET=dev-access-secret` because the developer `.env` carries a real secret; CI is unaffected (documented in the runbook).
- Browser-level E2E (Playwright/Cypress) is not part of the MVP gate; UI behavior is covered by the 50 vitest component/unit suites. Candidate for post-MVP tooling.

## Verdict

No regressions found. MVP flows are release-ready pending merge of the Phase 5 hardening PRs (#29–#32).
