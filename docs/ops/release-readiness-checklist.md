# Release Readiness Checklist

Walk this list top-to-bottom before tagging a release. Every box must be ticked or have a written waiver in the release PR. Companion documents: [deployment runbook](deployment-runbook.md), [migration review checklist](migration-review-checklist.md), [rollback notes template](rollback-notes-template.md).

## 1. Code and CI

- [ ] All release-scoped PRs merged to `main`; no half-merged feature spanning multiple open PRs.
- [ ] CI fully green on `main` (lint, typecheck, unit tests, integration tests, build, Prisma validate + migrate status + drift check, API/web docker builds).
- [ ] A regression pass has been recorded for this release (see `regression-pass-<date>.md`; latest: [2026-07-26](regression-pass-2026-07-26.md)).
- [ ] No `// DUMMY-DATA:` module newly exposed to end users without its screen being labeled "Preview".

## 2. API contract

- [ ] `apps/api/openapi.yaml` regenerated from the running API (`pnpm api:contract:sync`) and committed — the checked-in YAML matches the controllers being shipped.
- [ ] Orval client (`apps/web/lib/api/generated/`) regenerated in the same PR as any contract change; web typecheck green against it.
- [ ] `phase-three-readiness.spec.ts` passing (every endpoint documented, permission metadata declared).
- [ ] Breaking response-shape changes called out in the release notes (the error envelope is `{ error: { code, message, details? } }`; success is `{ data, meta?, message? }`).

## 3. Database

- [ ] Every new migration reviewed against the [migration review checklist](migration-review-checklist.md) with filled-in rollback notes in its PR.
- [ ] `prisma migrate status` clean against a staging copy of the production database.
- [ ] Seed baseline (`prisma/seed.sql`) still applies; role/permission changes reflected in it.
- [ ] Backup taken (or restore point confirmed) immediately before deploying migrations.

## 4. Security and access

- [ ] All non-public routes covered by `@Auth`/`@CheckPermissions` (deny-by-default guard is global; spot-check new controllers for accidental `@PublicRoute`).
- [ ] JWT secrets, database credentials, and S3 keys come from the deployment environment — never from committed files; `.env.example` lists every required variable.
- [ ] Access/refresh token expiries (`JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`) set to production values.
- [ ] S3 uploads restricted (`S3_ALLOWED_MIME_TYPES`, `S3_MAX_UPLOAD_SIZE_BYTES`); signed URL expiry sane.
- [ ] Audit events verified writing to `audit_logs` in staging (login, user create/update, role assign/unassign).

## 5. Observability

- [ ] `X-Request-Id` present on responses; access logs flowing as structured JSON lines (`HttpAccess` logger).
- [ ] 5xx alerting (or at minimum log review) wired to whatever aggregates stdout in the target environment.
- [ ] `GET /api/v1/health` wired as the liveness probe for the API container.

## 6. Frontend

- [ ] `NEXT_PUBLIC_API_BASE_URL` points at the deployed API origin.
- [ ] `proxy.ts` route matcher covers every protected route group being shipped.
- [ ] Production build (`pnpm build`) succeeds; no runtime references to dev-only endpoints.

## 7. AI chatbot (Phase 13)

Skip this section only if `AI_CHAT_ENABLED` is `false` in every target environment — in which case tick the first box and move on.

- [ ] `AI_CHAT_ENABLED` is `false` in production unless the [readiness review](../post-mvp/ai-chatbot-readiness.md) §5 conditions are met and recorded in the release PR (written clinic acceptance of the pattern-guard limits, signed vendor data-processing agreement).
- [ ] `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` is `false` unless SATUSEHAT master-data linkage has been verified — this flag is what sends patient data to a third party.
- [ ] `AI_PROVIDER_ENCRYPTION_KEY` set, 32 bytes, and **distinct** from `PATIENT_PII_ENCRYPTION_KEY` and `BPJS_CREDENTIAL_ENCRYPTION_KEY`.
- [ ] Exactly one `ai_provider_configs` row is active, and **Settings → AI Providers → Test** passes against it in the target environment.
- [ ] `AI_CHAT_RATE_LIMIT_PER_HOUR` and `AI_CHAT_MAX_SESSIONS_PER_DAY` set to values the clinic's provider budget can absorb at worst case (users × limit).
- [ ] `safetyTags` from the previous staging period reviewed — a rising `diagnosis_attempt` or `prescription_attempt` rate means the model is pushing at the guards and the prompts need work before wider exposure.
- [ ] Chat surfaces verified hidden for roles without `chat.session.create` and when no provider is active.

## 8. Sign-off

- [ ] Release notes drafted: user-facing changes, migration impact, rollback plan.
- [ ] Deployment window and owner agreed; runbook open during the deploy.
- [ ] Post-deploy verification steps (runbook §6) assigned to a named person.
