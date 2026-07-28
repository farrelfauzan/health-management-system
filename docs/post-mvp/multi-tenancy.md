# Multi-Tenancy Strategy

Companion to [implementation-plan.md](./implementation-plan.md) and [patient-identifiers.md](./patient-identifiers.md). Defines how HMS goes from one deployment per clinic to one platform serving many clinics, where the isolation boundary sits, and the order the migration has to run in.

**Status:** proposal. No task IDs are assigned yet — see §10 for where this belongs in the phase plan.

**Placement:** the tenant registry and connection routing must land **before a second clinic's production data exists**. What is stored here is `data pribadi yang bersifat spesifik` under UU PDP No. 27/2022 — a cross-tenant leak is a reportable breach against every clinic on the platform simultaneously, within 3×24 hours, and it is not recoverable by patching.

---

## 1. Decision

**One PostgreSQL database per tenant, on a shared cluster, with a per-tenant database role. A small control-plane database holds the tenant registry and user identity. The application resolves a tenant to a connection at request time and never holds two tenants' data on one connection.**

Isolation is a property of the connection, not of every query. That is the whole argument, and §2 is the reasoning.

---

## 2. Why Not a Shared Database

The alternative — one database, `tenant_id` on every clinical table, Postgres Row-Level Security, and a Prisma extension injecting the predicate — is the conventional SaaS answer and it was this document's first recommendation. It is rejected for medical records. The reasoning is recorded here because someone will propose it again.

### 2.1 What it would have provided

RLS policies with `FORCE ROW LEVEL SECURITY`, a runtime role without `BYPASSRLS`, application-layer predicate injection, the existing AES-256-GCM + HMAC-SHA256 identifier encryption ([patient-identifiers.md §3](./patient-identifiers.md)), per-module cross-tenant integration tests, and a DMMF-walking test asserting every model carries a partition column. Genuinely defensible, and it holds — for as long as every layer stays correct.

### 2.2 Why that is the wrong bet here

| Failure | Shared DB + RLS | DB per tenant |
| ------- | --------------- | ------------- |
| New table ships without an RLS policy | Silent leak; caught only by a test someone remembered to write | Impossible — the table lives inside one tenant's database |
| `$queryRaw` without a tenant predicate (exists today in the [MRN allocator](../../apps/api/src/common/mrn/mrn-allocator.repository.ts)) | Depends entirely on the runtime role never having `BYPASSRLS` | Scoped by the connection |
| `SET` instead of `SET LOCAL`, or a pooler reusing a connection with stale context | Cross-tenant reads that look like normal queries in the log | No shared context to leak |
| Per-tenant export / restore / offboarding | Filtered dump in FK order — every run is a chance to hand clinic A clinic B's rows | `pg_dump` one database |
| One clinic's bad bulk update or bad migration | Surgical repair inside a live shared table | Restore that database; nobody else is touched |
| Blast radius of any single mistake | Every clinic, at once | One clinic |

The cost argument for pooling does not apply. An empty Postgres database on a cluster you already run is a few megabytes of catalog. There is no meaningful saving to weigh against the blast radius.

### 2.3 What this deletes

Choosing per-tenant databases removes most of the work the shared-schema design implied:

- No `tenant_id` column on 24 tables, no backfill over signed medical records.
- No unique-constraint rewrites. `PatientProfile.mrn` stays `@unique`. `nikIndex` stays `@unique` — **and the cross-tenant PII oracle disappears entirely**: under a shared schema, a global unique index on the NIK blind index would make clinic B's registration fail for a patient already registered at clinic A, revealing that the patient exists elsewhere. Across databases that failure cannot occur, because the constraint only sees one clinic.
- No leading-`tenantId` rewrite on every index, no composite tenant FKs.
- No RLS policies, no split runtime/migration roles, no `SET LOCAL` inside every transaction, no Prisma query extension, no raw-query audit test.

`schema.prisma` stays as it is today. The isolation work moves into one routing layer and one migration runner — two components that can be reviewed in an afternoon, instead of an invariant that every query in the system must maintain forever.

### 2.4 What per-tenant databases do *not* solve

Be clear about the residual risk:

- **A wrong-tenant routing bug still serves the wrong clinic's data.** The gain is that this is one small code path with one obvious test, not a property of ~200 repository methods.
- **A compromised API process can reach every tenant database** it holds credentials for. Mitigated by fetching per-tenant credentials from a secrets manager on demand and caching them briefly, rather than baking every DSN into the environment — but a full application compromise is still a full compromise.
- **Backups share storage.** Per-tenant encryption keys (§6.3) are what limit that.
- **Cross-tenant platform analytics** ("how many clinics used feature X") stop being a SQL query and become an ETL job into a warehouse. That is a feature, not a regression: it forces aggregation to be deliberate.

### 2.5 The regulatory position

No Indonesian regulation known to us mandates physical database separation. UU PDP No. 27/2022 classes health data as specific personal data and requires proportionate technical measures; PMK 24/2022 governs electronic medical records and imposes long retention duties; PP 71/2019 drives data residency (host in an Indonesian region). Logical isolation with RLS would likely satisfy a regulator on paper.

So this is not a compliance checkbox — it is a blast-radius and procurement decision. The procurement half matters commercially: "your clinic's records are in your own database, and here is a dump of it" is a materially easier conversation with a hospital's committee than explaining row-level security. Confirm the exact retention period and any facility-specific obligations with counsel before the first enterprise contract; do not take the numbers in this document as legal advice.

---

## 3. What a Tenant Is

Two candidate boundaries, and they are not the same:

- **Organization (badan usaha)** — the legal entity that signs the contract and pays. `Klinik Saling Jaga Group`.
- **Facility (fasilitas kesehatan)** — the physical practice location. Its own SIP-registered doctors, its own BPJS PKS and PCare credentials, its own SATUSEHAT `Organization` id, its own paper folders and therefore its own MRN series.

**Decision: one database per organization. `Facility` is a table inside that database.**

- The target market (klinik pratama) is overwhelmingly one organization, one facility. The model degenerates cleanly.
- A group operating several branches usually wants **one** medical record across branches — a patient treated at branch B should not be a new record. Splitting per facility would fight that.
- The genuinely per-location things are a small, enumerable set: MRN series, BPJS credentials, SATUSEHAT `Organization` id, timezone, address, doctor SIP. Those carry `facilityId` inside the tenant database.

Consequence to accept explicitly: **branches of one tenant see each other's records.** That is what "one organization" means. A group needing branch-level isolation is modelled as two tenants — two databases — not as an extra predicate.

```
Control plane DB (one)
 ├── tenants            — slug, name, status, cluster, schema version
 ├── tenant_databases   — connection target + credential reference
 ├── users              — global identity (§4.1)
 └── tenant_memberships — which user may obtain a token for which tenant

Tenant DB (one per organization) — the current schema.prisma, unchanged
 ├── facilities         — MRN series, BPJS/SATUSEHAT credentials, timezone
 └── patients, encounters, prescriptions, roles, user_roles, audit_logs, …
```

---

## 4. Identity, Login, and Routing

### 4.1 User identity is global; clinical data is not

`User.email` is globally `@unique` today. Two options: per-tenant user rows, or one identity with per-tenant membership.

**Decision: `users`, `tenant_memberships`, and refresh tokens live in the control plane. Role assignments (`user_roles`) live in the tenant database.**

Indonesian practice decides this. A doctor holds one lifetime STR and **multiple SIPs, one per practice location** — the schema already models exactly that in `DoctorLicense` ([schema.prisma:436](../../apps/api/prisma/schema.prisma)). Multi-clinic practice is the norm, not an edge case; forcing a doctor into two accounts with two passwords is a product defect.

The split is deliberate: the control plane knows *that* a user may access a tenant, the tenant database knows *what* they may do there. No clinical data ever sits in the control plane, so a control-plane compromise leaks a membership graph, not medical records.

`DoctorProfile` remains one row **per tenant** — the same physician has a profile in each clinic's database, each with its own SIP, schedule, and patient assignments. `ownerUserId` points at the global user id.

### 4.2 Tenant is chosen at login, not per request

The access token is issued **for exactly one tenant**. `JwtPayload` ([packages/shared-types/src/auth/types.ts](../../packages/shared-types/src/auth/types.ts)) gains `tid`, and `roles` becomes the roles *within that tenant*:

```ts
export type JwtPayload = {
  sub: string;
  email: string;
  tid: string;      // tenant id — the only database this token may reach
  roles: string[];  // roles within `tid` only
};
```

1. `POST /auth/login` authenticates against the control plane. One active membership → issue tokens for it. Several → return the membership list and **no tokens**; the client calls `POST /auth/login/tenant` with the chosen tenant.
2. Switching tenants is a new token pair, never a header. There is no "act as another tenant with this token".
3. Refresh tokens are tenant-bound. Revoking a membership revokes that tenant's token families only — not the doctor's session at the other clinic.
4. The subdomain (`klinik-a.hms.id`) selects branding and the login target. **The token's `tid` is authoritative.** A tenant-A token presented on tenant-B's host is a 401, never a silent switch.

### 4.3 Connection routing

This is the one code path that isolation now depends on. Treat it accordingly: small, explicit, heavily tested.

- `TenantContextMiddleware` (in `apps/api/src/common/tenant/`, registered beside the existing [`RequestIdMiddleware`](../../apps/api/src/common/observability/request-id.middleware.ts)) reads the verified `tid` and stores it in an `AsyncLocalStorage` store next to the request id.
- `TenantConnectionRegistry` resolves `tid` → a `PrismaClient` bound to that tenant's database, from an LRU cache keyed by tenant id. A cache miss looks the tenant up in the control plane, fetches the credential from the secrets manager, and constructs a client.
- `TenantContextService.getTenantId()` **throws** when no tenant is set — fail closed. Routes that legitimately have none (`/health`, `/auth/login`, control-plane admin) carry an explicit `@PlatformRoute()` decorator, mirroring the existing `@PublicRoute()` pattern: opt out loudly, never by accident.
- Repositories never take a `tenantId` parameter. They receive an already-scoped client. A `tenantId` in a service signature is a smell — it means someone can pass the wrong one.

**Pooling.** [`PrismaService`](../../apps/api/src/common/prisma/prisma.service.ts) already constructs its own `pg` `Pool` and wraps it in `PrismaPg` (Prisma 7 driver adapters), so per-tenant pool sizing is directly controllable — this is the one place the existing code needs restructuring, from a singleton client into a factory plus cache. Point every client at PgBouncer rather than Postgres directly, with a small `connection_limit` (2–3) per tenant and `min_pool_size=0` so idle clinics hold nothing. In transaction pooling mode, disable prepared statements on the adapter. Rough ceiling: a few hundred tenant databases per cluster before connection management dominates; past that, `tenants.clusterId` routes to a second cluster and nothing else changes.

Evict idle clients from the LRU on a timer — a clinic that closes at 5pm should not hold a pool overnight.

---

## 5. Provisioning and Migrations

The operational cost of this design is concentrated here. It is real, and it is the honest price of the isolation.

### 5.1 Provisioning a tenant

1. Create the database from a template that already carries the current schema (`CREATE DATABASE … TEMPLATE hms_tenant_template`) — near-instant, and avoids running the full migration history per tenant.
2. Create a per-tenant role with privileges on that database only. Store the credential in the secrets manager; the control plane holds a **reference**, never the password.
3. Apply any migrations newer than the template.
4. Seed baseline roles and permissions (the existing [`seed.sql`](../../apps/api/prisma/seed.sql)), create the first `Facility`, record MRN prefix/width and timezone.
5. Register the tenant, mark `ACTIVE`.

Refresh the template image on every release so step 3 stays cheap.

### 5.2 Migration fan-out

`prisma migrate deploy` runs once per tenant database. Requirements:

- **Expand/contract is mandatory, not stylistic.** A fan-out is never atomic, so the application must run correctly against schema version N and N−1 simultaneously. The repo already practices this (`…_doctor_nik_encryption_expand` / `…_contract`); it now becomes a hard rule, and the [migration review checklist](../ops/migration-review-checklist.md) should say so.
- **Record the schema version per tenant** in the control plane. Alert on any tenant lagging the current release. Version skew that nobody notices is the characteristic failure of this architecture.
- **The runner is resumable and idempotent** — partial failure across 80 databases must be safe to re-run.
- **Deploy order:** migrate first (backward-compatible by construction), then roll the application.
- CI additionally runs migrations against a scratch tenant database and the control plane, so both chains stay validated by `pnpm db:validate` and the existing integration job.

### 5.3 Control-plane schema

The control plane is a second Prisma schema and a second migration chain (`prisma/control/schema.prisma`). Small — tenants, tenant databases, users, memberships, refresh tokens, platform audit. Keep it that way; every table added here is a table outside tenant isolation.

---

## 6. Security Controls

Isolation is the boundary; these are the controls inside and around it.

### 6.1 Credentials

Per-tenant database roles, passwords in a secrets manager (not env), fetched on cache miss and held in memory only. No process ever holds a DSN list for all tenants in its environment. Rotation is per tenant and does not require a deploy.

### 6.2 Access to the boundary

- The API's control-plane credentials are separate from any tenant credential.
- Migration credentials are separate from runtime credentials and are not available to the API process at all.
- Human database access is per-tenant and audited; there is no shared "read everything" role. If a support engineer needs a clinic's data, that is a named, time-boxed grant.

### 6.3 Encryption

The existing identifier scheme ([patient-identifiers.md §3](./patient-identifiers.md)) — AES-256-GCM ciphertext, HMAC-SHA256 blind index, `last4` for masked display, `keyVersion` per identifier — carries over unchanged. What changes is key scope:

**Per-tenant data keys become feasible and should be adopted.** Under a shared schema this was rejected as unmanageable; with per-tenant databases the key resolves through the same registry as the connection. A tenant DEK wrapped by a KMS master key means a leaked backup of one clinic decrypts nothing belonging to another. `PATIENT_PII_ENCRYPTION_KEY` / `PATIENT_PII_INDEX_KEY` stop being deployment env vars ([.env.example](../../apps/api/.env.example)) and become per-tenant material, with the env values kept only as the single-tenant development path.

Note the trade-off accepted knowingly: a per-tenant index pepper makes cross-tenant patient matching impossible forever. That is the correct default for a processor handling other people's medical records — national matching is SATUSEHAT's job, not ours.

### 6.4 Authorization is unchanged

**Tenancy is not a permission.** CASL keeps answering "may this role do this action", scoped `OWN`/`ANY` *within* the tenant ([ability.factory.ts](../../apps/api/src/common/authorization/ability.factory.ts)). `ANY` means "any patient in this clinic", and after this change it means that literally rather than by accident.

One change: `SUPER_ADMIN` today receives `manage:all` unconditionally ([permissions.guard.ts:62](../../apps/api/src/common/authorization/permissions.guard.ts)). That role becomes the *clinic's own* super admin, scoped to its database. Platform staff are a separate concept — a distinct token type, an explicit impersonation endpoint, a time-boxed token, and mandatory `TENANT_IMPERSONATION_STARTED` / `_ENDED` audit records written to **both** the control plane and the tenant's own audit log, so the clinic can see when we looked. It must never be a flag on the ordinary user path.

**Error semantics:** an unknown id returns **404, not 403.** 403 confirms a resource exists somewhere, which is an enumeration oracle over MRNs and patient ids.

### 6.5 Observability

Add `tenantId` to the request-context store and to every log line and metric label ([observability.types.ts](../../apps/api/src/common/observability/observability.types.ts)). Tenant id is not PII; patient data still must never be logged. Per-tenant dashboards and per-tenant error budgets fall out for free, and support will ask for them immediately.

---

## 7. Migration Path From Today

**M0 — Control plane.** Stand up the control-plane database and its schema. Register the existing deployment as tenant one, pointing at the existing database. Nothing reads it yet.

**M1 — Routing.** Add `tid` to the JWT, the membership-based login flow, `TenantContextService`, and `TenantConnectionRegistry`. Restructure `PrismaService` from a singleton into a factory plus LRU cache. With one tenant registered, behaviour is identical — this is the whole point: the routing layer ships and is exercised in production before a second tenant exists. Old tokens lack `tid` and must be rejected, so this deploy invalidates sessions; schedule it outside clinic hours and note it in the [release checklist](../ops/release-readiness-checklist.md).

**M2 — Provisioning and fan-out.** Build the provisioning job, the template database, the resumable migration runner, and per-tenant schema-version tracking. Prove it by provisioning a staging tenant and running two releases across both.

**M3 — Per-tenant secrets.** Move database credentials and PII encryption keys into the secrets manager, resolved per tenant. Keep env-based values as the development path.

**M4 — Facility config.** Retire the single-tenant fallbacks: the nil-UUID MRN counter sentinel ([mrn-allocator.repository.ts:11](../../apps/api/src/common/mrn/mrn-allocator.repository.ts)), hard-coded [`FACILITY_CONFIG`](../../apps/web/lib/facility/facility-config.ts), and `CLINIC_TIMEZONE` / `PATIENT_MRN_PREFIX` / `PATIENT_MRN_WIDTH` as deployment env — all become `Facility` columns. MRN format is **baked into every number already allocated**, so it is set at onboarding and never edited afterwards.

Every M is its own PR with its own rollback note. M0–M3 are individually revertible while there is one tenant; that window closes the moment a second tenant is provisioned, which is the argument for doing all of them before the second customer signs.

---

## 8. Frontend Impact (`apps/web`)

- **Tenant resolution in [proxy.ts](../../apps/web/proxy.ts).** The subdomain selects branding and the login target; after login the token's `tid` is validated against the host, and a mismatch forces re-login. Keep it edge-safe — cookie read and stateless claim decode only, per the frontend rules.
- **`FACILITY_CONFIG` becomes server-loaded tenant branding**, fetched in a server component and passed down. The type survives; the constant does not.
- **TanStack Query cache must be cleared on tenant switch**, and keys namespaced by tenant. A doctor switching clinics in one browser tab must not read clinic A's patient list from cache. This is the frontend's version of the same isolation bug and deserves the same seriousness.
- **No API surface change.** Tenant is ambient in the token, never a path or query parameter — so `openapi.yaml` and the Orval client are unaffected apart from the login response shape and the new tenant-selection endpoint. Regenerate with `pnpm api:contract:sync` in the M1 task.

---

## 9. Testing and Operations

### 9.1 Testing

- **A two-tenant integration fixture**: two provisioned databases, each with a doctor, patient, encounter, prescription. Every module's integration spec asserts a tenant-A token gets **404** on tenant-B ids — one negative test per module, not one for the suite.
- **Routing tests are the critical suite**, since routing is now the isolation boundary: no context → throw, unknown tenant → 401, suspended tenant → 403, membership revoked mid-session → refresh fails, LRU eviction under concurrency never hands back the wrong client. That last one is the highest-value test in the codebase.
- **A fan-out test**: run a migration across two tenant databases, kill it midway, re-run, assert convergence.
- **A skew test**: application version N against schema N−1, asserting expand/contract discipline actually holds.

### 9.2 Operations

- **Onboarding** is a runbook, not just a job: provision, choose MRN prefix/width (immutable afterwards), set timezone, invite the first admin, then the external per-facility steps — BPJS branch-office bridging ([bpjs-pcare.md §7](./bpjs-pcare.md)), SATUSEHAT `Organization` id, AI provider config if enabled.
- **Backup and restore are per database** — the main operational dividend. Point-in-time restore of one clinic touches nobody else. Test the restore path before the second tenant, not after the first request.
- **Offboarding is not deletion.** PMK 24/2022 imposes retention duties that outlive the contract, so a churned clinic's records cannot be dropped on cancellation. `TenantStatus.OFFBOARDING`: logins disabled, credentials revoked, database retained under legal hold, plus an export the clinic owns. Hard deletion is a separate, explicitly authorised operation.
- **Noisy neighbour**: per-tenant statement timeouts and API rate limits. One clinic's report must not stall another's registration desk — and with separate databases, per-tenant resource caps are actually enforceable.

---

## 10. Sequencing

Ordered against **customer count**, not phase number:

- **M0–M1 (control plane + routing)** should land before Phase 9 (billing) and Phase 11 (BPJS). Both add tables and per-facility credentials; writing them tenant-aware from the start is free, retrofitting is not.
- **M2–M4** must complete before the second tenant is provisioned.
- If a second customer signs before this starts, the correct stopgap is a **separate deployment per clinic** — separate database, separate stack, manual. Ugly at three clinics, impossible at thirty, but safe, and it buys time to do this properly. It is also, notably, the same isolation boundary this design formalises, which is why the stopgap converges rather than throwing work away.

---

## 11. Open Decisions

1. **Group visibility** — the default is that branches of one tenant share records (§3). Product sign-off, not engineering.
2. **Where `Medication` sits** — stock is inherently per-location and lives in the tenant database; the KFA national catalog is reference data and arguably belongs in the control plane or a read-only shared catalog. Resolve when the KFA import lands; per-tenant copies work in the meantime.
3. **Custom roles per tenant** — trivially supported now that `roles` is per-database. Whether to expose role authoring is a scope call.
4. **Platform support impersonation** — needed for support, dangerous by construction. Design it with its own token type and dual-sided audit before anyone builds a shortcut into the ordinary auth path.
5. **Retention period and processor obligations** under PMK 24/2022 and UU PDP — confirm the exact figures with counsel before the first enterprise contract.
