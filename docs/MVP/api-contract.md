# HMS API Contract (MVP)

## 1. Global Conventions

- Base path: `/api/v1`
- Style: REST-first, resource-oriented endpoints
- Content type: `application/json`
- Auth: JWT Bearer token for protected routes

Response envelope:

- Success:

```json
{
  "data": {},
  "meta": {},
  "message": "optional"
}
```

- Error:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## 2. Authentication and Authorization

- Use guards for authentication.
- Authorization is permission-based (`resource.action:scope`), not role-name checks in controllers.
- Support ownership checks for `:own` resources.

MVP default roles:

- `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PHARMACIST`, `PATIENT`

Role mapping rule:

- Roles below are the default seed policy for MVP.
- Actual enforcement must use permission checks; role labels are for access planning and API documentation.

## 3. Validation and DTOs

- Validate all request DTOs with Zod (`nestjs-zod`).
- Define reusable request schemas in `packages/shared-types`.
- In backend modules, wrap shared schemas with DTO classes via `createZodDto(...)` for Nest route bindings.
- In frontend forms, reuse the same shared schemas to keep validation parity with backend contracts.
- Reject unknown/invalid payload fields.
- Keep request/response DTOs explicit and versionable.

## 4. Pagination and Filtering

- Use one pagination strategy consistently per resource (cursor or page-based).
- Include pagination metadata under `meta`.
- Standardize query params per module (`status`, date ranges, owner ids).

## 5. Module Endpoint Surface with RBAC (MVP)

### Auth

| Endpoint                    | Permission                            | Default Roles                                             |
| --------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `POST /api/v1/auth/login`   | Public                                | Public                                                    |
| `POST /api/v1/auth/refresh` | Public (valid refresh token required) | Public                                                    |
| `POST /api/v1/auth/logout`  | `auth.logout:own`                     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PHARMACIST`, `PATIENT` |

### RBAC

| Endpoint                          | Permission          | Default Roles          |
| --------------------------------- | ------------------- | ---------------------- |
| `GET /api/v1/rbac/roles`          | `role.read:any`     | `SUPER_ADMIN`, `ADMIN` |
| `POST /api/v1/rbac/assign-role`   | `role.assign:any`   | `SUPER_ADMIN`, `ADMIN` |
| `POST /api/v1/rbac/unassign-role` | `role.unassign:any` | `SUPER_ADMIN`, `ADMIN` |

RBAC role list response note:

- `GET /api/v1/rbac/roles` returns active roles only for UI role selectors.
- Recommended role item shape: `{ id, code, name }` (plus optional `description` if needed by UI).

### Admin/Users

| Endpoint                  | Permission        | Default Roles          |
| ------------------------- | ----------------- | ---------------------- |
| `GET /api/v1/users`       | `user.read:any`   | `SUPER_ADMIN`, `ADMIN` |
| `POST /api/v1/users`      | `user.create:any` | `SUPER_ADMIN`, `ADMIN` |
| `PATCH /api/v1/users/:id` | `user.update:any` | `SUPER_ADMIN`, `ADMIN` |

### Patient Management

| Endpoint                   | Permission                               | Default Roles                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `GET /api/v1/patients`     | `patient.read:any`                       | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`                  |
| `POST /api/v1/patients`    | `patient.create:any`                     | `SUPER_ADMIN`, `ADMIN`                            |
| `GET /api/v1/patients/:id` | `patient.read:any` or `patient.read:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own) |

### Doctor Management

| Endpoint                             | Permission                                                 | Default Roles                               |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| `GET /api/v1/doctors`                | `doctor.read:any`                                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` |
| `POST /api/v1/doctors`               | `doctor.create:any`                                        | `SUPER_ADMIN`, `ADMIN`                      |
| `PATCH /api/v1/doctors/:id/schedule` | `doctor.schedule.write:any` or `doctor.schedule.write:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own)      |

### Appointment Management

| Endpoint                               | Permission                                           | Default Roles                                                           |
| -------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/appointments`             | `appointment.read:any` or `appointment.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)                       |
| `POST /api/v1/appointments`            | `appointment.create:any` or `appointment.create:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)                       |
| `PATCH /api/v1/appointments/:id`       | `appointment.update:any` or `appointment.update:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own, limited fields) |
| `POST /api/v1/appointments/:id/cancel` | `appointment.cancel:any` or `appointment.cancel:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own)                 |

### Registration Flow

| Endpoint                          | Permission                                             | Default Roles                                           |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `GET /api/v1/registrations`       | `registration.read:any` or `registration.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)       |
| `POST /api/v1/registrations`      | `registration.create:any` or `registration.create:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own)                 |
| `PATCH /api/v1/registrations/:id` | `registration.update:any` or `registration.update:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own, limited fields) |

### Pharmacy Flow

| Endpoint                     | Permission                                           | Default Roles                                  |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `GET /api/v1/medications`    | `medication.read:any`                                | `SUPER_ADMIN`, `ADMIN`, `PHARMACIST`, `DOCTOR` |
| `POST /api/v1/prescriptions` | `prescription.write:any` or `prescription.write:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`               |
| `POST /api/v1/dispenses`     | `dispense.write:any`                                 | `SUPER_ADMIN`, `ADMIN`, `PHARMACIST`           |

### AI Chatbot

| Endpoint                                  | Permission                                         | Default Roles                                           |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/v1/chat/sessions`              | `chat.session.create:own`                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`             |
| `POST /api/v1/chat/sessions/:id/messages` | `chat.message.create:own`                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`             |
| `GET /api/v1/chat/sessions/:id/messages`  | `chat.message.read:any` or `chat.message.read:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own) |
