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

## 3. Permission Grammar

Use normalized permission keys:

- `<resource>.<action>:<scope>`

Examples:

- `user.read:any`
- `appointment.read:own`
- `prescription.write:any`
- `chat.message.create:own`

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
- Never rely on frontend checks for access control.

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
- Include RBAC management permissions such as `role.read:any`, `role.assign:any`, and `role.unassign:any` for admin-level workflows.

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
