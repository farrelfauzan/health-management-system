# Code Review Fixes — Admin & Patient Management (`apps/api`)

Review of branch `feature/p3-t01-p3-t02-admin-management` (diff vs `main`), 2026-07-17.
10 verified findings, ranked by severity. Each section states the problem, where it lives, and a proposed fix.

---

## 1. Privilege escalation: ADMIN can mint a SUPER_ADMIN 🔴 Critical

**Where:** `apps/api/src/modules/admin-management/service/admin-management.service.ts` (`createAdminUser` ~line 43, `updateAdminUser` ~line 96)

**Problem:** `POST /api/v1/users` and `PATCH /api/v1/users/:id` accept any role code that exists in the `roles` table — including `SUPER_ADMIN`. The zod schema (`roleCodes: z.array(z.string().min(1))`) has no allow-list, `findActiveRolesByCodes` filters only on `code IN (...)`, and the seed grants ADMIN `user.create:any` / `user.update:any`. A plain ADMIN can therefore create (or convert) an account with `roleCodes: ['SUPER_ADMIN']` and gain `manage/all`.

**Fix:** Enforce a role-assignment ceiling in the service, using the acting user's own roles:

```ts
// admin-management.service.ts
private static readonly PRIVILEGED_ROLE_CODES = new Set(['SUPER_ADMIN']);

private async assertCanAssignRoles(roleCodes: string[], currentUserId: string) {
  const requestedPrivileged = roleCodes.filter((code) =>
    AdminManagementService.PRIVILEGED_ROLE_CODES.has(code),
  );
  if (requestedPrivileged.length === 0) return;

  const actor = await this.authRepository.findUserById(currentUserId);
  const actorIsSuperAdmin = actor?.roles.some((r) => r.role.code === 'SUPER_ADMIN');
  if (!actorIsSuperAdmin) {
    throw new ForbiddenException('You are not allowed to assign this role');
  }
}
```

Call it in both `createAdminUser` and `updateAdminUser` before resolving role IDs. (Injecting `AuthRepository` mirrors what `PatientManagementService` already does; once fix #4 lands, read the actor from the request instead of re-querying.)

---

## 2. Email uniqueness check → unhandled P2002 → 500 🔴 High

**Where:** `admin-management.service.ts:37` (create) and `:84` (update); `admin-management.repository.ts` (`findActiveUserByEmail`)

**Problem:** The pre-check filters `deletedAt: null`, but `users_email_key` is a **full** unique index (no `WHERE deleted_at IS NULL`). Reusing a soft-deleted user's email — or two concurrent creates with the same email — passes the pre-check and then throws Prisma `P2002`, which nothing handles → HTTP 500 instead of 409.

**Fix (two parts, both recommended):**

1. **Widen the pre-check** to match the real constraint — drop the `deletedAt: null` filter for the uniqueness lookup (a soft-deleted user still occupies the email):

```ts
async findUserByEmailIncludingDeleted(email: string) {
  return this.prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
}
```

2. **Close the race with a global exception filter** that maps `P2002` to 409 for every module, instead of per-call-site try/catch:

```ts
// apps/api/src/common/prisma/prisma-exception.filter.ts
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (exception.code === 'P2002') {
      return super.catch(new ConflictException('Resource already exists'), host);
    }
    super.catch(exception, host);
  }
}
```

Register via `APP_FILTER` in `app.module.ts` so patient MRN (#3) and all future unique fields are covered too.

---

## 3. Patient MRN check → unhandled P2002 → 500 🔴 High

**Where:** `apps/api/src/modules/patient-management/service/patient-management.service.ts:124`; `patient-management.repository.ts` (`findPatientByMrn`)

**Problem:** Same shape as #2. `patient_profiles_mrn_key` is a full unique index, but `findPatientByMrn` filters `deletedAt: null`. The concurrent-create race is reachable **today**; the soft-delete variant becomes live the moment a patient delete endpoint lands.

**Fix:** Covered by the global `PrismaExceptionFilter` from #2, plus change `findPatientByMrn` to `findUnique({ where: { mrn } })` without the soft-delete filter (a soft-deleted patient still occupies the MRN). If the intended behavior is instead that a soft-deleted patient's MRN is reusable, the index must become partial: `CREATE UNIQUE INDEX ... ON patient_profiles(mrn) WHERE deleted_at IS NULL` — pick one, but code and index must agree.

---

## 4. Patient service re-implements RBAC and has already diverged 🟠 High

**Where:** `patient-management.service.ts:205` (`resolveScope`, `getActorOrThrow`)

**Problem:** `PermissionsGuard` injects an implicit `manage/all` permission for `SUPER_ADMIN` (`permissions.guard.ts:62-66`), but `resolveScope` only matches explicit `resource/action/scope` rows. A SUPER_ADMIN whose role data diverges from `seed.sql` passes the guard, then gets a 403 from the service. Independently, `getActorOrThrow` re-runs the exact 4-level `findUserById` join the guard just executed — the most expensive query in the request, paid twice on **every** patient endpoint.

**Fix:** Make the guard the single source of truth. After it loads the user and flattens permissions, attach them to the request:

```ts
// permissions.guard.ts — after computing flatPermissions (incl. the SUPER_ADMIN manage/all row)
request.actorPermissions = flatPermissions;
```

```ts
// apps/api/src/common/authorization/actor-permissions.decorator.ts
export const ActorPermissions = createParamDecorator(
  (_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().actorPermissions ?? [],
);
```

Controllers pass the permissions into the service; the service keeps only ANY-vs-OWN resolution and treats `manage/all` as `hasAny`. Delete `getActorOrThrow` and the second DB hit. Remove `AuthModule` from `PatientManagementModule.imports` once `AuthRepository` is no longer injected.

---

## 5. Integration tests exercise routes that don't exist in production 🟠 High

**Where:** `apps/api/src/modules/auth/auth-rbac.integration.spec.ts:50-55`, `patient-management.integration.spec.ts:47-52`

**Problem:** The specs call `setGlobalPrefix('api/v1')` **and** URI versioning (`prefix: 'v'`, default `'1'`), producing test routes `/api/v1/v1/...`. Production (`main.ts`) uses `setGlobalPrefix('api')`, so real routes are `/api/v1/...`. The specs also never install the global `ZodValidationPipe`, so DTO validation is not exercised — malformed bodies that production would 400 flow straight into services.

**Fix:** Extract the bootstrap wiring once and share it:

```ts
// apps/api/src/app.setup.ts
export function configureApp(app: INestApplication): void {
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v', defaultVersion: '1' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
}
```

Call `configureApp(app)` from `main.ts` and from every integration spec, then fix the test URLs to `/api/v1/rbac/roles`, `/api/v1/patients`, etc. Any future pipe/interceptor added to bootstrap is then automatically covered by tests.

---

## 6. Committed `openapi.yaml` is stale for the feature in this PR 🟠 Medium

**Where:** `apps/api/openapi.yaml`

**Problem:** The spec contains no `/api/v1/patients` paths and no patient DTO schemas, although `PatientManagementController` ships in the same diff. Spec-driven consumers (orval client in `apps/web`) cannot call the new endpoints.

**Fix:**
1. Regenerate now: start the API and run `pnpm --filter api openapi:export`, commit the result.
2. Add a CI freshness guard so this can't recur — export the spec in CI and fail on diff:

```bash
pnpm --filter api openapi:export && git diff --exit-code apps/api/openapi.yaml
```

(Alternatively generate the document without booting a server via a small script that creates the Nest app with `SwaggerModule.createDocument` and writes the YAML — avoids needing a live DB in CI when combined with `DISABLE_PRISMA_CONNECT`.)

---

## 7. 403 vs 404 leaks patient-record existence 🟡 Medium

**Where:** `patient-management.service.ts:103-111` (`getPatientById`), `:159-168` (`updatePatient`)

**Problem:** An own-scope caller gets **403** when the patient exists but is owned by someone else, and **404** when the id doesn't exist. The status difference lets a PATIENT-role user confirm which patient ids exist (ids leak via URLs, logs, referrals) — an existence disclosure in a HIPAA-adjacent system.

**Fix:** Return 404 for both cases when the caller lacks `ANY` scope:

```ts
if (!patient) {
  throw new NotFoundException('Patient not found');
}
if (!readScope.hasAny && patient.ownerUserId !== currentUser.sub) {
  throw new NotFoundException('Patient not found'); // was ForbiddenException
}
```

Update the integration test that currently asserts 403 for the unowned-detail case.

---

## 8. Search treats `%` and `_` as wildcards 🟡 Medium

**Where:** `admin-management.repository.ts:24` (email), `patient-management.repository.ts:47,53` (fullName, mrn)

**Problem:** Prisma 7.8.0 compiles `contains` + `mode: 'insensitive'` to `ILIKE` with the user value bound verbatim — no escaping (verified against the installed query compiler). `?search=%` matches every row; `_` matches any single character; literal `%`/`_` in emails or MRNs can't be searched. Values are parameterized, so this is wildcard semantics, not SQL injection.

**Fix:** Escape LIKE metacharacters before building the filter, in one shared helper:

```ts
// apps/api/src/common/prisma/escape-like.ts
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
```

Use `contains: escapeLike(search)` in both repositories.

---

## 9. Duplicate role codes rejected with a misleading 400 🟢 Low

**Where:** `admin-management.service.ts:45` (create), `:96` (update)

**Problem:** Validation compares `roles.length !== payload.roleCodes.length`, but `code: { in: [...] }` returns each role once. `roleCodes: ['ADMIN','ADMIN']` (allowed by zod) yields 1 ≠ 2 → 400 "One or more role codes are invalid" even though every code is valid.

**Fix:** Dedupe first and compare against the unique set:

```ts
const uniqueRoleCodes = [...new Set(payload.roleCodes)];
const roles = await this.adminManagementRepository.findActiveRolesByCodes(uniqueRoleCodes);
if (roles.length !== uniqueRoleCodes.length) {
  throw new BadRequestException('One or more role codes are invalid');
}
```

This also prevents duplicate `userRole` rows reaching `createMany`.

---

## 10. List endpoints wrap independent reads in an interactive transaction 🟢 Low (efficiency)

**Where:** `admin-management.repository.ts:31-54` (`listUsers`), `patient-management.repository.ts:62-75` (`listPatients`)

**Problem:** `executeTransaction` is the interactive `$transaction(fn)` form. Each list request opens a transaction, runs `findMany` then `count` **sequentially**, and pins a pooled connection across both round-trips — pure overhead for two independent read-only queries with the same `where`.

**Fix:** Use the batched form (pipelined, still a consistent snapshot) or `Promise.all`:

```ts
const [items, total] = await this.prisma.$transaction([
  this.prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { ... } }),
  this.prisma.user.count({ where }),
]);
```

Apply the same change in both repositories.

---

## Appendix — additional cleanups (found, below the cut line)

Not bugs, but worth folding into follow-up work:

- **Dead auth boilerplate:** six copies of `if (!currentUser?.sub) throw new UnauthorizedException(...)` across both controllers re-check what `PermissionsGuard` already guarantees. Make `@AuthUser()` return a non-optional `CurrentUser` (throw inside the decorator if absent) and delete the per-handler checks.
- **`parseDateOnly` duplicates zod validation:** `createPatientSchema` already validates format/calendar/future-date. Move string→`Date` conversion into the shared schema with `.transform()` so services receive a `Date`.
- **Triple-repeated response mapping:** `AdminManagementService` writes the same user→response literal three times; extract a `toUserResponse` helper like the patient service's `toPatientResponse`.
- **Post-transaction re-fetch:** `createUserWithRoles`/`updateUserWithRoles` commit, then re-query the user. A single nested `create` with `include` (or a `findUniqueOrThrow` inside the transaction) removes the extra round-trip and the impossible "Created user not found" 404 branch.
- **Duplicated pagination schema:** `listPatientsQuerySchema` is byte-identical to `listUsersQuerySchema`; extract a shared `paginationQuerySchema` in `@hms/shared-types` and `.extend()` per module.
- **Unusable index:** the btree index on `patient_profiles.full_name` cannot serve `ILIKE '%term%'` search — drop it, or use a `pg_trgm` GIN index if search performance matters.
- **`/api/openapi.yaml` raw adapter route:** registered directly on the HTTP adapter, bypassing Nest guards/interceptors/filters and hard-coding the `api` prefix; prefer `SwaggerModule.setup`'s `yamlDocumentUrl` option.
- **Hand-rolled soft-delete filters:** both repositories spread `deletedAt: null` manually although `PrismaService` ships `findFirstActive`/`findManyActive` helpers (used by the rbac repository); longer-term, a Prisma client extension injecting the filter for soft-deletable models removes the footgun entirely.
- **Test-infra nits:** `--passWithNoTests` means a jest misconfiguration silently skips all tests; `testRegex: 'src/.*\.spec\.ts$'` collapses to unescaped dots in a plain string (use `String.raw` or double backslashes); `tsconfig.spec.json` inherits the parent's `src/**/*.spec.ts` exclude, so no whole-program typecheck covers specs.
