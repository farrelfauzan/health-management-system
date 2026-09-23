# RBAC Strategy (Backend + Frontend)

## 1. Scope

This document defines the RBAC model for HMS MVP using IAM-style role assignment and CASL-based authorization.

- Backend: NestJS + CASL in guards/decorators.
- Frontend: Next.js + CASL for UI and route capability checks.
- Policy source of truth: backend permissions and ownership rules.
- Delivery gate: frontend RBAC wiring for clinical modules starts after backend readiness gate is complete.

## 2. IAM-Style Access Model

Core entities:

- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRole`

Behavior:

- Admin can assign/unassign roles to users.
- Role assignment history is auditable (`assignedBy`, `assignedAt`, `unassignedBy`, `unassignedAt`).
- Authorization is permission-based, not hardcoded role checks in controllers.

Default roles for MVP:

- `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PHARMACIST`, `PATIENT`

### 2.1 Custom roles are self-contained (P22-T03, P22-T04)

A role composed in the IAM screen must work from the keys an administrator ticks, with no unstated prerequisites. Three mechanisms make that true, and each reads its rules from `@hms/shared-types`, so the API, the seed guards and the IAM screen share one list:

- **Baseline keys** (`BASELINE_ROLE_PERMISSION_KEYS`) are what signing in needs: sign-out, one's own name, notifications, feature availability and bug reports. They are attached on role create and kept on every permission update.
- **Dependencies** (`resolvePermissionRequirements`, closed over by `expandPermissionDependencies`) are what a key needs to be usable. A `write` needs the `read` of the same resource and scope when the catalogue has one, and `EXPLICIT_PERMISSION_DEPENDENCIES` covers the rest. For example, `encounter.record-vitals:any` needs the admin portal, because its only screen is there. `PUT /rbac/roles/:id/permissions` saves the closure, and the IAM matrix ticks it as the administrator clicks. A key another ticked key needs is shown locked, with the reason. `permission-dependencies.spec.ts` checks that every seeded role already satisfies every rule, so saving a seeded shape through IAM adds nothing.
- **Effects** (`describePermissionEffects`) are what a key does beyond its own screen. The catalogue reports three of them, and the IAM screen labels each key and warns about the whole selection:
  - MFA enrolment (`PRIVILEGED_PERMISSION_PATTERNS`, SJ-8);
  - the shell a `portal.*` key opens (a role with none is sent back to the sign-in page, and with several the admin shell wins);
  - D-033 clinical content (`CLINICAL_CONTENT_PERMISSION_KEYS`, which the seed's SUPER_ADMIN exclusion must equal).

A new permission key that only works alongside another one gets an entry in `EXPLICIT_PERMISSION_DEPENDENCIES`, not a sentence in a ticket.

**Templates and the role guide (P22-T05).** `ROLE_TEMPLATES` holds the three custom roles clinics build: FRONT_NURSE, CASHIER and RECEPTIONIST. `POST /rbac/roles` accepts `templateCode` and grants the template's keys, closed over their dependencies, with the role. `role-templates.spec.ts` holds each template to five conditions against the seed:
- every key is real;
- the set is already closed under its dependencies;
- it opens exactly one shell;
- it asks no member for MFA;
- it reaches no clinical content beyond triage vital signs.

Midwives use the seeded `MIDWIFE` role, never a template. The IAM "Role guide" dialog is generated from the templates and the live catalogue.

**Shells (P22-T05).** A session may open every shell it holds a portal key for. `resolveOpenableShells` decides this; SUPER_ADMIN is pinned to the admin shell, because its union holds every portal key. By default the user lands on the admin shell, then on the shell they last picked in the profile menu's switcher (the `hms_preferred_shell` cookie, honoured only for a shell the session can open).

## 3. Permission Grammar

Use normalized permission keys:

- `<resource>.<action>:<scope>`

Examples:

- `user.read:any`
- `appointment.read:own`
- `appointment.approve:any`
- `appointment.session.read:any`
- `prescription.write:any`
- `chat.message.create:own`
- `doctor-patient.assign:any`
- `doctor-patient.activity.read:any`

Scope rules:

- `any`: permission on all resources.
- `own`: permission only for owned resources (validated in service/repository query constraints).

## 4. Backend Implementation (CASL)

### 4.1 Packages

- `@casl/ability` for ability construction and checks.

### 4.2 Layer Responsibilities

- `repository`: load user roles + permissions; apply ownership filters in queries.
- `service`: build CASL rules from permissions and ownership context.
- `controller`: declare required permissions via decorators only.

### 4.3 Decorator Contract (Reference-Driven)

Use and adapt the provided references from `docs/decorator-references/`:

- `permission.decorator.ts` -> `CheckPermissions(...rules)`
- `http.decorator.ts` -> `Auth(permissions, options)` wrapper
- `public-route.decorator.ts` -> `PublicRoute()`
- `auth-user.decorator.ts` -> `AuthUser()`

Current backend pattern:

- `Auth(...)` is metadata-only (permissions + optional `public` flag via `PublicRoute`).
- Guards are wired globally with `APP_GUARD`, so feature modules do not repeatedly register `JwtAuthGuard`/`PermissionsGuard`.

Recommended metadata shape:

```ts
type PermissionRule = {
  action: string;
  subject: string;
};
```

### 4.4 PermissionsGuard Pattern

- Read required rules from `PERMISSION_CHECKER_KEY` metadata.
- Read authenticated user from request.
- Resolve user roles -> permissions -> CASL rules.
- Build ability with CASL.
- Call `ForbiddenError.from(ability).throwUnlessCan(action, subject)` for each required rule.
- Return 403 with safe message on forbidden actions.

Global guard order (required):

- `JwtAuthGuard` executes first to resolve authenticated actor and attach `request.user`.
- `PermissionsGuard` executes second to evaluate permission metadata.
- Both guards are registered with `APP_GUARD` in a shared/global authorization module.

### 4.5 Ability Factory

Create a dedicated factory/service (example: `ability.factory.ts`) to avoid guard bloat:

```ts
type AppAbility = MongoAbility<[string, string]>;

@Injectable()
export class AbilityFactory {
  createForUser(userPermissions: Array<{ action: string; subject: string; conditions?: Record<string, unknown> }>): AppAbility {
    return createMongoAbility(userPermissions);
  }
}
```

### 4.6 Ownership Enforcement

- CASL can express ownership conditions.
- Backend must still enforce ownership at data access level (query filters by `patientId`, `doctorId`, `ownerUserId`, etc.).
- For doctors, `patient.read:own` means an active `DoctorPatient` assignment exists between the authenticated doctor's profile and the requested patient; it does not mean every patient with a historical appointment.
- For patients, related-doctor reads must use the same active assignment and expose only fields allowed by the doctor response projection.
- Assignment/unassignment requires `doctor-patient.assign:any` or `doctor-patient.unassign:any`; being one side of the relationship does not grant mutation permission by default.
- Assignment activity-log reads require `doctor-patient.activity.read:any`; assignment visibility does not implicitly grant access to the administrative audit log.
- Never rely on frontend checks for access control.

#### Row-level enforcement in repository where-clauses (SJ-2)

`OWN` scope is enforced **inside the SQL `where`**, never by fetching a row and
checking ownership afterwards. Repositories on scoped resources take a
required actor context (`PatientScopeActor`: `{ userId, scope }`) and merge a
scope fragment into every query; the fragment is built by a single per-domain
helper (patients: `build-patient-scope-where.ts`) that is the source of
ownership truth.

Two ownership modes exist for patients, and the distinction is deliberate:

| Mode | Reaches | Used by |
| --- | --- | --- |
| `CARE` | owning user **or** a doctor with an active `DoctorPatient` assignment (`unassignedAt: null`, doctor active and not deleted) | patient detail reads, patient lists |
| `SELF` | strictly the owning user | identifier unmasking, patient updates, privacy-notice history |

A doctor's care relationship never widens `SELF`: identifier plaintext and
notice evidence are between the clinic and the patient, and clinical work runs
on the MRN.

Appointments and sessions follow the same discipline with their own fragments
(`build-appointment-scope-where.ts`, `build-session-scope-where.ts`):

| Resource | `OWN` reaches | Rationale |
| --- | --- | --- |
| Appointment | participant-side: the owning user of the **patient** on the row or of the **doctor** on the row | a booking connects two parties; each side sees it |
| AppointmentSession (incl. queue, calendars, per-doctor session lists) | doctor-side only: the session doctor's owning user | a practice session belongs to its doctor; a patient-side relationship never reaches one |
| ChatSession / ChatMessage | the session's `ownerUserId` directly (`findSessionForOwner`, owner-mandatory lists, owner-scoped soft delete); messages are reachable only through the scoped session | a conversation belongs to the user who opened it; the admin support list is a separate `read:ANY`-gated route |
| Prescription | participant-side: the owning user of the **patient** on the row or of the prescribing **doctor** (`build-prescription-scope-where.ts`) | same two-party rule as appointments; dispensing, inventory, and medications are `ANY`-only actions with no row scope |
| Registration | patient-side only: the owning user of the patient being registered (`build-registration-scope-where.ts`) | a registration belongs to the patient; the queue board and staff worklists are separate `ANY`-gated routes |

Direct-by-ID probes answer **404, not 403**, when the row exists but is out of
scope — not-found and not-yours must be indistinguishable so a UUID scan
cannot become a resource-existence oracle. 403 remains the answer for
action-level denials (no scope at all for the action), which is decided before
any query runs.

### 4.7 Controller Usage Example

```ts
@Get(':id')
@Auth([{ action: 'read', subject: 'Patient' }])
findOne(@UUIDParam('id') id: string, @AuthUser() user: CurrentUser) {
  return this.patientService.findOne(id, user);
}
```

## 5. Frontend Implementation (CASL)

### 5.1 Packages

- `@casl/ability`
- `@casl/react`

### 5.2 FE Authorization Source

- On request render (server boundary), validate token/profile payload and derive permission rules.
- Build and evaluate CASL ability on server for route-level capability gate before rendering private UI.
- Pass serializable rules to a client-side ability provider at layout/page or feature-boundary parent.
- Rebuild boundary ability when auth/role payload changes.

### 5.3 Ability Builder Example

```ts
import { createMongoAbility, MongoAbility } from '@casl/ability';

export type AppAbility = MongoAbility<[string, string]>;

export function buildAbility(rules: Array<{ action: string; subject: string; conditions?: Record<string, unknown> }>): AppAbility {
  return createMongoAbility(rules);
}
```

### 5.4 Ability Provider + `AppCan` Wrapper (Recommended)

```tsx
'use client';

import { AbilityContext } from '@casl/react';

export function AbilityProvider({ ability, children }: { ability: AppAbility; children: React.ReactNode }) {
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}
```

```tsx
import { Can } from '@casl/react';

export const APP_ACTIONS = ['manage', 'create', 'read', 'update', 'delete'] as const;
export const APP_SUBJECTS = [
  'All',
  'User',
  'Role',
  'Patient',
  'Doctor',
  'DoctorPatient',
  'DoctorPatientActivity',
  'Appointment',
  'Registration',
  'Medication',
  'Prescription',
  'DispenseRecord',
  'ChatSession',
  'ChatMessage',
] as const;

export type AppAction = (typeof APP_ACTIONS)[number];
export type AppSubject = (typeof APP_SUBJECTS)[number];

type AppCanProps = {
  action: AppAction;
  subject: AppSubject;
  field?: string;
  data?: Record<string, unknown>;
  not?: boolean;
  passThrough?: boolean;
  children: React.ReactNode | ((isAllowed: boolean) => React.ReactNode);
};

export function AppCan({ action, subject, children, ...props }: AppCanProps) {
  return (
    <Can I={action} a={subject} {...props}>
      {children}
    </Can>
  );
}
```

```tsx
<AppCan action="create" subject="Appointment">
  <CreateAppointmentButton />
</AppCan>
```

Notes:

- This gives better autocomplete and type safety than raw `Can` props.
- Keep `AppAction` and `AppSubject` in shared FE auth/rbac module (or `packages/shared-types` if reused).
- Optional: create `AppCan` variants like `AppCanOwn` when ownership data is consistently required.
- Place provider once per boundary (layout/page/feature-root), never inside leaf form/table/button components.

### 5.5 Route and Action Guards

- Route-level guard: check ability before rendering private pages.
- Component-level guard: hide/disable actions user cannot execute.
- Mutation-level safety: still call API and handle `403` gracefully.

### 5.6 Route Registry for Sidebar RBAC (Reference)

Keep one centralized route config file for sidebar/route permissions (example target: `apps/web/src/config/app-routes.ts`).

```ts
type AppRoute = {
  path: string;
  name: string;
  sidebar: boolean;
  meta?: {
    action?: AppAction;
    subject?: AppSubject;
    public?: boolean;
  };
};

export const APP_ROUTES: AppRoute[] = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    sidebar: true,
    meta: {
      action: 'read',
      subject: 'Dashboard',
    },
  },
  {
    path: '/landing',
    name: 'Landing',
    sidebar: false,
    meta: {
      public: true,
    },
  },
];
```

Filtering helper pattern:

```ts
export function canAccessRoute(route: AppRoute, ability: AppAbility): boolean {
  if (route.meta?.public) return true;
  if (!route.meta?.action || !route.meta?.subject) return true;
  return ability.can(route.meta.action, route.meta.subject);
}

export function getSidebarRoutes(ability: AppAbility): AppRoute[] {
  return APP_ROUTES.filter((route) => route.sidebar && canAccessRoute(route, ability));
}
```

### 5.7 TanStack Query Integration

- Rebuild ability after login/logout/refresh profile query.
- Invalidate protected queries when role bindings change.
- Use centralized 403 handler to show permission-aware messages.

### 5.5 Permission Propagation and the Stale-Claim Window (D-022, D-023)

Three readers of one permission model, with deliberately different freshness:

| Surface | Reads from | Freshness after a role edit |
| --- | --- | --- |
| `PermissionsGuard` (API) | Database, per request | Immediate — next request |
| `proxy.ts` shell gating (web) | JWT `permissions` claim — `portal.*` only | Next token refresh — up to `JWT_ACCESS_EXPIRES_IN` |
| CASL ability (web) | `hms_session_hint`, `packedPermissions` | Next token refresh — reissued on the same call |

The two web rows are one model split across two cookies (D-023), not two
models. The access token carries `portal.*` alone because the full set made it
4229 bytes against a 4096-byte browser cookie limit and the browser dropped it
outright; everything else is packed into the session hint. Both cookies are
rewritten together on every login and refresh, so they converge at the same
moment and the window below applies to both.

The claim is advisory by contract, so the web tier's staleness is a cosmetic
lag, never an authorization gap: revoked users keep menus that 403 on use;
newly granted users wait one refresh (or re-login) for menus to appear. The
window is accepted rather than engineered away — see D-022 in
[decisions.md](decisions.md) for the evaluation of forced refresh.

Rules for code in this window:

- Never make a UI decision irreversible on the claim alone; render optimistic
  affordances only where the failing API call surfaces cleanly (the standing
  `notifyApiError` path).
- The fallback presets are fallbacks, not merges: one applies only when **no**
  claim maps to a rule and the claims carry a seeded admin role code. Real
  claims always win — a custom role's ability comes from its claims
  exclusively (`app-ability.server.spec.ts`).
- There are two presets, and which one applies matters.
  `SUPER_ADMIN_PORTAL_RULES` is `manage all`, mirroring the catalogue-wide
  grant `seed.sql` gives that role by construction rather than by
  enumeration; `ADMIN_PORTAL_ADMIN_RULES` deliberately withholds
  `role.create/update/delete`, because the seed withholds them from `ADMIN`.
  Enumerating the super-admin case instead would drift silently on the next
  permission seed — and drift here does not fail a build, it hides a button.
- `proxy.ts` shares the same bound: shell access follows the `portal.*`
  claims and converges at the same refresh. Those keys keep their `:any` /
  `:own` scope in the token because the proxy matches them exactly; the
  packed hint entries have their scope stripped, since `permissionToRule`
  discards it anyway. A web-tier check that genuinely needs a scope must read
  `portal.*` or ask the API.

## 6. API and Data Requirements for RBAC

Backend should expose enough data for FE ability construction:

- `GET /api/v1/auth/me` includes user identity + roles + flattened permissions.
- Permission payload should include `action`, `subject`, optional `conditions`.
- Do not expose sensitive internals (secret scopes, provider secrets, raw policy engine configs).
- `GET /api/v1/rbac/roles` should return active roles for UI role-selection forms.

DTO/schema contract rule:

- Keep reusable RBAC request schemas in `packages/shared-types`.
- Backend DTOs should import those schemas and bind them with `createZodDto(...)`.
- Frontend RBAC forms/actions should reuse the same shared schemas to avoid contract drift.

## 7. Seed Policy Baseline

- Seed system roles on first migration/seed.
- Seed minimum permission set per module.
- `SUPER_ADMIN` gets full management permissions.
- Other roles get least privilege by default.
- Clinical record content is granted only to clinician roles (`DOCTOR` and `MIDWIFE`, D-034), scoped to the treating clinician and active assignments. Non-clinician roles may hold only task access scoped to one order (pharmacist, lab technician) or billing lines, and `SUPER_ADMIN`'s all-permissions union stops at clinical keys. Enforcement is P22-T02; the rule and its legal basis (Permenkes 24/2022 Pasal 30, 32–34) are D-033 in `docs/post-mvp/decisions.md`.
- Include RBAC management permissions such as `role.read:any`, `role.assign:any`, and `role.unassign:any` for admin-level workflows.
- Seed doctor-patient assignment, unassignment, and activity-read permissions for `SUPER_ADMIN` and `ADMIN`; grant doctors `patient.read:own` only for actively assigned patients.
- Seed `appointment.approve:any` and `appointment.session.update:any` for `ADMIN` only; seed `appointment.session.read:any` for `ADMIN` and `PATIENT` (session listings drive patient self-service booking) and `appointment.session.read:own` for `DOCTOR` (a doctor consults their own calendar only). `DOCTOR` holds no `appointment.create` grant — booking belongs to the front desk and the patient portal.

## 8. Implementation Checklist

1. Add CASL packages to `apps/api` and `apps/web`.
2. Implement ability factory in backend service layer.
3. Implement `PermissionsGuard` using decorator metadata.
4. Wire `Auth()` + `CheckPermissions()` decorators from `docs/decorator-references` pattern.
5. Add ownership query constraints in repositories.
6. Add `auth/me` permission payload endpoint.
7. Implement frontend ability provider and typed `AppCan` usage.
8. Implement centralized FE route registry (`APP_ROUTES`) for sidebar RBAC filtering.
9. Add unit tests for guard/factory and integration tests for 403/200 access scenarios.
10. Add active doctor-patient assignment conditions to patient read abilities and repository filters.
11. Add doctor-patient assignment, unassignment, and activity-read permissions to seed data and authorization tests.
