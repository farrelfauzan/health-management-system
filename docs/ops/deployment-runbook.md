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
- `PATIENT_PII_ENCRYPTION_KEY`, `PATIENT_PII_INDEX_KEY`, `PATIENT_PII_KEY_VERSION` — identifier encryption. Both keys are 32 bytes (base64 or hex), must differ from each other and from `AI_PROVIDER_ENCRYPTION_KEY`, and the API refuses to boot without them. Rotation procedures in §5.
- `PATIENT_MRN_PREFIX`, `PATIENT_MRN_WIDTH` — medical record number format. **Set once, before the first patient exists.** Every number already allocated carries the old format, and MRNs printed on physical folders cannot be renumbered.
- `PORT` — defaults to 3001.
- **AI chatbot (Phase 13, both feature flags default off):** `AI_CHAT_ENABLED` and `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` gate the feature and the sending of patient context respectively — see the [readiness review](../post-mvp/ai-chatbot-readiness.md) §5 for what must be true before either is turned on. `AI_PROVIDER_ENCRYPTION_KEY` (32 bytes, base64 or hex, **distinct from the PATIENT_PII and BPJS keys**) seals clinic API keys; without it the API boots normally but storing a provider key fails with `AI_NOT_CONFIGURED`. Rotation in §5.4. Resilience and quota knobs (`AI_PROVIDER_*`, `AI_CHAT_RATE_LIMIT_PER_HOUR`, `AI_CHAT_MAX_SESSIONS_PER_DAY`) have safe defaults. Provider credentials themselves are **never** environment variables — they are encrypted database rows managed through Settings → AI Providers.

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
   **Data migrations that need application keys.** A few migrations encrypt existing
   values and therefore cannot be expressed in SQL, because the AES/HMAC keys live
   only in the application environment. These ship as an *expand → backfill →
   contract* trio, and the contract migration refuses to run while un-backfilled
   rows remain, so a plain `migrate deploy` fails loudly rather than destroying
   data. When a release contains one, run the backfill between the two migrations:

   ```bash
   pnpm db:migrate:deploy                        # applies the expand migration
   pnpm --filter @hms/api backfill:doctor-nik    # encrypts existing plaintext values
   pnpm db:migrate:deploy                        # applies the contract migration
   ```

   Backfill scripts are idempotent — rows already converted are skipped, so a
   partial run can simply be repeated. They exit non-zero and skip any row whose
   value is malformed; correct those rows and re-run before the contract
   migration will pass. Shipped so far: `backfill:doctor-nik` (doctor NIK
   encryption, `20260727090000` → `20260727091000`).
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
- **Audit trail**: sensitive mutations (logins, user management, role changes) are recorded in the `audit_logs` table (`actor_user_id`, `action`, `resource`, `metadata`, `occurred_at`). Identifier disclosure is audited too — `PATIENT_IDENTIFIER_UNMASKED` and `DOCTOR_IDENTIFIER_UNMASKED` name which fields were revealed and to whom, never the values; `PATIENT_MRN_IMPORTED` records legacy migrations.
- **API docs**: Swagger UI at `/api/docs`, contract YAML at `/api/openapi.yaml`.

### 5.1 Rotating `PATIENT_PII_ENCRYPTION_KEY` (ciphertext key)

Incremental, resumable, and safe to run against a live database — ciphertext is per-row, so rows can move to the new key in batches.

1. Deploy the new key alongside the old one and bump `PATIENT_PII_KEY_VERSION`. Keep the old key readable until step 4 completes.
2. Batch over `patient_profiles` and `doctor_profiles` where `*_key_version` is below the new version: decrypt with the old key, re-encrypt with the new, write ciphertext and `*_key_version` in one update per row.
3. Blind indexes are untouched — the pepper did not change, so uniqueness holds throughout and no constraint needs rebuilding.
4. When no row remains at the old version, remove the old key from the environment.

Interrupting the backfill is safe: rows are independent and `*_key_version` records exactly how far it got.

### 5.2 Rotating `PATIENT_PII_INDEX_KEY` (blind-index pepper)

**Expensive — plan a maintenance window, and only do this on compromise.** Recomputing an HMAC needs the plaintext, so every row must be decrypted first, and the unique constraint must hold the whole way through.

1. Add a second index column per identifier (e.g. `nik_index_next`) with a unique constraint, nullable.
2. Deploy a build that dual-writes both index columns on every write path (create, update, legacy import).
3. Backfill `*_index_next` for existing rows: decrypt, normalise, HMAC with the new pepper. A duplicate here means two records are the same person — route them to the merge workflow rather than forcing the write.
4. Swap reads to the new column, drop the old column and its constraint, and rename.
5. Retire the old pepper.

Never log a decrypted identifier, a key, or a pepper at any step. A lost `PATIENT_PII_ENCRYPTION_KEY` is unrecoverable data loss — key custody and backup are a precondition for going live, not a follow-up.

### 5.3 Rotating `BPJS_CREDENTIAL_ENCRYPTION_KEY` (BPJS PCare credentials)

Cheap — the key seals at most one `bpjs_pcare_configs` row per facility, and every plaintext exists outside HMS (BPJS issued it), so the worst case is re-entering credentials rather than data loss.

1. Deploy the new key and bump `BPJS_CREDENTIAL_KEY_VERSION`. Keep the old key readable until step 2 completes.
2. For each `bpjs_pcare_configs` row below the new version: decrypt with the old key, re-seal with the new, write ciphertext columns and `credential_key_version` in one update. With a single facility this is one row — an admin re-saving the credentials through Settings → Integrasi BPJS (`PUT /api/v1/bpjs/config` with all three secrets) achieves the same thing without touching the database.
3. Remove the old key from the environment and run the **Test Connection** action to confirm the stored credentials still decrypt and sign.

A lost `BPJS_CREDENTIAL_ENCRYPTION_KEY` is recoverable: delete the stored configuration and re-enter the credentials from the BPJS issuance letter. Every create/update/delete/test is audited (`BPJS_CONFIG_*`, `BPJS_CONNECTION_TESTED`) with field names only, never values.

### 5.4 Rotating `AI_PROVIDER_ENCRYPTION_KEY` (AI provider API keys)

Cheap, and cheaper than the BPJS equivalent: every plaintext exists in the vendor's dashboard, so the worst case is issuing a new key there.

1. Deploy the new key and bump `AI_PROVIDER_KEY_VERSION`. Keep the old key readable until step 2 completes.
2. For each `ai_provider_configs` row below the new version, rotate the key through **Settings → AI Providers → Edit** (enter a value in the API key field; leaving it blank keeps the stored one). This re-seals under the current key without touching the database.
3. Remove the old key from the environment and run **Test** on the active configuration to confirm the stored key still decrypts and authenticates.

A lost key is recoverable: issue a new key at the vendor and re-enter it. Keyless configurations (self-hosted Ollama without auth) are unaffected — they store empty ciphertext and never touch crypto. Every create/update/activate/delete/test is audited with field names only, never values.

## 6. Post-deploy verification

1. `curl -s https://<api>/api/v1/health` → `{"status":"ok","service":"api"}` with an `X-Request-Id` response header.
2. Log in through the web app with a staging account; confirm a `USER_LOGIN` row lands in `audit_logs`.
3. Load one list screen per critical module (patients, doctors, appointments, registrations) — no 5xx in the API logs.
4. `pnpm --filter @hms/api exec prisma migrate status` against the production `DATABASE_URL` — up to date, no drift.
5. Trigger one known 404 (bogus patient id) and confirm the error envelope `{ "error": { "code": "NOT_FOUND", ... } }`.
6. If the AI chatbot is enabled in this environment: `GET /api/v1/chat/availability` returns `isAvailable: true`, and **Settings → AI Providers → Test** on the active configuration succeeds. If it is not enabled, confirm availability reports `isAvailable: false` with the expected reason — the chat entry point should be absent from the shell.

## 7. Known gaps (tracked for post-MVP)

- Production-grade Dockerfiles (multi-stage, non-root) — current images are the dev variants CI builds.
- Log aggregation/alerting is environment-dependent; only stdout JSON is guaranteed by the app.
- Browser-level E2E smoke suite not yet automated; §6 is manual.
