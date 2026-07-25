# Deployment Runbook

How to deploy the HMS monorepo (NestJS API + Next.js web + PostgreSQL). Written for the current docker-based setup (`infra/docker/`); the same sequence applies to any orchestrator. Run the [release readiness checklist](release-readiness-checklist.md) first.

## 1. Topology

| Component | Artifact | Port | Health |
| --- | --- | --- | --- |
| API | `infra/docker/api/Dockerfile.dev` (dev; production image TODO) | 3001 | `GET /api/v1/health` → `{"status":"ok","service":"api"}` |
| Web | `infra/docker/web/Dockerfile.dev` (dev; production image TODO) | 3000 | HTTP 200 on `/` (login redirect is fine) |
| PostgreSQL | `postgres:16-alpine` (compose service `postgres`) | 5432 | `pg_isready` |
| Migrations | compose service `migrate` (`tools` profile) | — | exits 0 |

## 2. Required environment

API (`apps/api/.env.example` is the authoritative list):

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random values, rotated per environment. The code falls back to `dev-*-secret` values when unset — production MUST set both.
- `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` — e.g. `15m` / `7d`.
- `S3_REGION`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REQUEST_TIMEOUT_MS`, `S3_SIGNED_URL_EXPIRES_IN_SECONDS`, `S3_MAX_UPLOAD_SIZE_BYTES`, `S3_ALLOWED_MIME_TYPES` — object storage.
- `CLINIC_TIMEZONE` — IANA zone for session scheduling (e.g. `Asia/Jakarta`).
- `PORT` — defaults to 3001.

Web:

- `NEXT_PUBLIC_API_BASE_URL` — public API origin (baked in at build time; a changed value requires a rebuild).

## 3. Deploy sequence

Order matters: **backup → migrate → API → web**. Migrations must be backward compatible with the previous API release (enforced by the [migration review checklist](migration-review-checklist.md)), so old pods may briefly serve traffic against the new schema.

1. **Announce + freeze**: post the deploy window; stop merging to `main`.
2. **Backup**: snapshot the database (`pg_dump -Fc` or provider snapshot). Record the snapshot id in the release notes.
3. **Apply migrations**:
   ```bash
   pnpm db:migrate:deploy          # or: pnpm docker:dev:migrate (compose 'migrate' service)
   pnpm --filter @hms/api exec prisma migrate status   # must print "Database schema is up to date!"
   ```
4. **Roll the API**: deploy the new image; wait until `GET /api/v1/health` returns 200 and startup logs show `Nest application successfully started`.
5. **Roll the web**: deploy the rebuilt Next.js image (rebuild if `NEXT_PUBLIC_API_BASE_URL` changed).
6. **Unfreeze** after post-deploy verification (§6) passes.

## 4. Rollback

Application rollback and schema rollback are separate decisions — consult the migration's rollback notes (linked from its PR) before touching the database.

- **App-only rollback** (bug in code, schema untouched or additive): redeploy the previous API/web images. Additive migrations may stay in place.
- **Schema rollback**: Prisma has no down migrations. Either apply a new forward migration containing the reversal SQL from the rollback notes, or restore the pre-deploy snapshot (accepting the data-loss window) and redeploy the previous API together with it.
- After any rollback: rerun `prisma migrate status`, hit `/api/v1/health`, and run the verification queries from the rollback notes.

## 5. Standard operations

- **Seed roles/permissions baseline** (fresh environment only): `pnpm db:seed`.
- **Logs**: API writes structured JSON lines to stdout — access logs under the `HttpAccess` context (`requestId`, `method`, `path`, `statusCode`, `durationMs`, `userId`), 5xx details under `AllExceptionsFilter`. Correlate any user report via the `X-Request-Id` response header.
- **Audit trail**: sensitive mutations (logins, user management, role changes) are recorded in the `audit_logs` table (`actor_user_id`, `action`, `resource`, `metadata`, `occurred_at`).
- **API docs**: Swagger UI at `/api/docs`, contract YAML at `/api/openapi.yaml`.

## 6. Post-deploy verification

1. `curl -s https://<api>/api/v1/health` → `{"status":"ok","service":"api"}` with an `X-Request-Id` response header.
2. Log in through the web app with a staging account; confirm a `USER_LOGIN` row lands in `audit_logs`.
3. Load one list screen per critical module (patients, doctors, appointments, registrations) — no 5xx in the API logs.
4. `pnpm --filter @hms/api exec prisma migrate status` against the production `DATABASE_URL` — up to date, no drift.
5. Trigger one known 404 (bogus patient id) and confirm the error envelope `{ "error": { "code": "NOT_FOUND", ... } }`.

## 7. Known gaps (tracked for post-MVP)

- Production-grade Dockerfiles (multi-stage, non-root) — current images are the dev variants CI builds.
- Log aggregation/alerting is environment-dependent; only stdout JSON is guaranteed by the app.
- Browser-level E2E smoke suite not yet automated; §6 is manual.
