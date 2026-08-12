# Secrets: inventory, storage, rotation

**SJ-5.** Every credential the HMS holds, where it lives, who can read it, and
how to change it without an outage.

The rule this document exists to keep true: **no secret is in git, and every
secret is rotatable without a code change or an image rebuild.** A secret that
requires a rebuild to rotate does not get rotated.

---

## Scan status

A full-history scan of all 352 commits found **no credential ever committed**.
The only secret-shaped strings in the repository are placeholders in
`apps/api/.env.example` and the well-known development values in
`infra/docker/docker-compose.dev.yml` — both intentional, both refused in
production by `validateEnvironment`.

Nothing is burned, so **no rotation is outstanding**. The table below is the
procedure for when one is.

The scan now runs on every pull request as the `secret-scan` CI job
(`gitleaks` against `--all --full-history`, config in `.gitleaks.toml`). To run
it locally:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.21.2 detect \
  --source=/repo --config=/repo/.gitleaks.toml \
  --log-opts="--all --full-history" --redact --verbose
```

---

## Inventory

### Required at boot

The API refuses to start without these. There is no compiled-in fallback: a
fallback turns a missing secret into a _working_ deployment signed with a value
published in this repository, and a deployment that works is one nobody
investigates.

| Secret               | Stored in                | Readable by  | Rotation                          |
| -------------------- | ------------------------ | ------------ | --------------------------------- |
| `DATABASE_URL`       | host `.env`, mode `0600` | server admin | [DB password](#database-password) |
| `JWT_ACCESS_SECRET`  | host `.env`              | server admin | [JWT keys](#jwt-signing-keys)     |
| `JWT_REFRESH_SECRET` | host `.env`              | server admin | [JWT keys](#jwt-signing-keys)     |

Production additionally requires both JWT secrets to be ≥ 32 characters and not
one of the known placeholders — enforced in
`apps/api/src/common/config/validate-environment.ts`.

### Encryption keys

These seal data at rest. **Losing one is data loss**, not an inconvenience:
ciphertext sealed under a discarded key cannot be recovered. Each carries a
`*_KEY_VERSION` so a re-encryption migration can tell old rows from new.

| Secret                           | Seals                                         | Rotation                                   |
| -------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `PATIENT_PII_ENCRYPTION_KEY`     | patient NIK / BPJS number                     | [envelope keys](#envelope-encryption-keys) |
| `PATIENT_PII_INDEX_KEY`          | blind-index lookups over the above            | [envelope keys](#envelope-encryption-keys) |
| `AI_PROVIDER_ENCRYPTION_KEY`     | AI provider API keys in `ai_provider_configs` | [envelope keys](#envelope-encryption-keys) |
| `BPJS_CREDENTIAL_ENCRYPTION_KEY` | BPJS bridging credentials in `bpjs_*_configs` | [envelope keys](#envelope-encryption-keys) |

### External integration credentials

Feature-gated: absent, the integration is off and the rest of the API boots.

| Secret                                               | Issued by                | Rotation                                     |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------- |
| `SATUSEHAT_CLIENT_ID` / `SATUSEHAT_CLIENT_SECRET`    | Kemkes SATUSEHAT console | reissue in console → update `.env` → restart |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`          | object-store IAM         | [external API keys](#external-api-keys)      |
| `AI_PLATFORM_API_KEY`                                | AI vendor console        | [external API keys](#external-api-keys)      |
| `WA_GATEWAY_*` (basic auth, webhook secret, API key) | set by us on the gateway | change on both sides in one restart          |

### Stored in the database, not in env

BPJS bridging credentials and per-clinic AI provider keys are entered through
the admin UI and sealed with the envelope keys above. They rotate through the
application, not through `.env` — but they are only as safe as
`BPJS_CREDENTIAL_ENCRYPTION_KEY` and `AI_PROVIDER_ENCRYPTION_KEY`.

### CI

GitHub Actions secrets only, referenced as `${{ secrets.* }}`. Note that an
unconfigured GitHub secret expands to `""`, not to unset — `??` does not catch
it, so anything read in CI must treat empty as absent.

`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are set to the well-known dev values
as plain workflow `env`, deliberately. They are test fixtures: nothing they
sign has authority outside the runner, and production refuses them.

---

## Rotation procedures

### JWT signing keys

The only procedure here that must not log anybody out. A single-key deployment
cannot change its JWT secret without invalidating every access and refresh
token in flight — for a clinic, that is every workstation dropping
mid-consultation.

Each family has one **signing** key and an ordered list of **verification**
keys (`apps/api/src/common/config/jwt-secrets.service.ts`).

```bash
# 1. Install the new key; retire the old one to verify-only.
JWT_ACCESS_SECRET="<new>"
JWT_ACCESS_SECRET_PREVIOUS="<old>"
# restart the API
```

New tokens are now signed with `<new>`; tokens already in circulation still
verify against `<old>`.

```bash
# 2. Wait one refresh-token lifetime — JWT_REFRESH_EXPIRES_IN, default 7d.
#    After this, nothing signed with <old> can still be presented.

# 3. Drop the retired key.
JWT_ACCESS_SECRET_PREVIOUS=""
# restart the API
```

`*_PREVIOUS` accepts a comma-separated list, so an interrupted rotation can be
resumed rather than unwound. Rotate `JWT_REFRESH_SECRET` the same way with
`JWT_REFRESH_SECRET_PREVIOUS`.

**Skipping step 2 is the mistake to avoid** — dropping the old key early is
exactly the mass logout the mechanism exists to prevent.

Proven end to end by `apps/api/src/common/config/jwt-key-rotation.spec.ts`,
which asserts each of the three steps from a signed-in session's point of view.

### Database password

1. `ALTER ROLE hms_app WITH PASSWORD '<new>';`
2. Update `DATABASE_URL` in the host `.env`.
3. Restart the API.

Brief connection errors between 1 and 3 are expected. Once SJ-11 splits the
runtime and migration roles, rotate them independently.

### External API keys

Issue-before-revoke, always:

1. Issue a new key in the vendor console.
2. Update `.env`, restart, confirm the integration works.
3. **Then** revoke the old key.

Revoking first turns a rotation into an outage.

### Envelope encryption keys

Not a swap — a re-encryption. Do not change these in place.

1. Add the new key alongside the old and increment `*_KEY_VERSION`.
2. Run a migration that decrypts with the old key and re-encrypts with the new,
   writing the new version marker.
3. Only once no row carries the old version, remove the old key.

**Discarding a key before step 2 completes destroys every row still sealed
under it.** No such rotation has been performed; when the first one is, record
it in the log below.

---

## Verifying the guarantees

```bash
# Fail-fast: blank a required secret, expect a refusal to start.
cd apps/api && JWT_ACCESS_SECRET="" pnpm exec nest start
# Expect: Error: Invalid environment configuration:
#           - JWT_ACCESS_SECRET is required but missing or empty

# Rotation, and the validator's rules.
pnpm --filter @hms/api exec jest --config ./jest.config.cjs src/common/config
```

---

## Rotation log

Record every rotation here — date, secret, who, why. An empty log is a claim
that nothing has ever been rotated, which is only credible for a system this
young.

| Date | Secret | Rotated by | Reason                                                     |
| ---- | ------ | ---------- | ---------------------------------------------------------- |
| —    | —      | —          | No rotation performed. History scan clean; nothing burned. |
