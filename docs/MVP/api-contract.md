# HMS API Contract (MVP)

## 1. Global Conventions

- Base path: `/api/v1`
- Style: REST-first, resource-oriented endpoints
- Content type: `application/json` by default; feature-owned file upload endpoints may use `multipart/form-data`
- Auth: JWT Bearer token for protected routes
- S3-backed files: endpoints return only short-lived signed URLs with expiry metadata; permanent object URLs and object keys are never exposed

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

Error-shape status note: the API does not yet install a global exception filter, so thrown `HttpException`s currently surface Nest's default shape (`{ "message", "error", "statusCode" }`). The web client's `resolveApiErrorMessage` accepts both shapes (including `string[]` validation messages) and surfaces the backend message inline and as a top-right toast. New error-producing code should still target the envelope above; adding the global filter is the outstanding conformance task.

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

File-storage contract notes:

- Object storage is infrastructure, not a standalone API resource. There are no generic S3 or profile-picture endpoints.
- A domain module that owns a file adds the upload/delete workflow to its own endpoint and injects the common object-storage provider into its service.
- Feature services persist private object keys internally. API responses must never expose those keys or permanent S3 URLs.
- Every S3-backed URL returned by any endpoint must be a short-lived signed URL accompanied by `expiresAt`; clients must not persist it.
- Upload validation, authorization, replacement, and cleanup rules belong to the owning domain service.

### Patient Management

| Endpoint                   | Permission                               | Default Roles                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `GET /api/v1/patients`     | `patient.read:any` or `patient.read:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (assigned), `PATIENT` (own) |
| `POST /api/v1/patients`    | `patient.create:any`                     | `SUPER_ADMIN`, `ADMIN`                            |
| `GET /api/v1/patients/:id` | `patient.read:any` or `patient.read:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (assigned), `PATIENT` (own) |
| `PATCH /api/v1/patients/:id` | `patient.update:any` or `patient.update:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own) |

Patient relation behavior:

- Create payloads may include optional `doctorIds`; creation and initial assignments are atomic.
- List queries may filter by `doctorId` and return bounded doctor summaries or `doctorCount`, not unbounded nested profiles.
- Detail responses include active related doctors using an explicit compact response type.
- Compact doctor items contain only `{ id, fullName, specialty }`; relation collections use their own pagination metadata when they can exceed the configured detail limit.

### Doctor Management

| Endpoint                             | Permission                                                 | Default Roles                               |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| `GET /api/v1/doctors`                | `doctor.read:any`                                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` |
| `GET /api/v1/doctors/:id`            | `doctor.read:any`                                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` |
| `POST /api/v1/doctors`               | `doctor.create:any`                                        | `SUPER_ADMIN`, `ADMIN`                      |
| `PATCH /api/v1/doctors/:id/schedule` | `doctor.schedule.write:any` or `doctor.schedule.write:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own)      |

Doctor relation behavior:

- Create payloads may include optional `patientIds`; creation and initial assignments are atomic.
- List queries may filter by `patientId` and return bounded patient summaries or `patientCount`.
- Detail responses include active related patients only when the caller has permission to view those patient fields.
- Compact patient items contain only `{ id, medicalRecordNumber, fullName }`; sensitive identity/contact fields require the normal patient-detail permission check.

### Doctor-Patient Assignments

| Endpoint                                         | Permission                                  | Default Roles                     |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------- |
| `POST /api/v1/doctor-patient-assignments`        | `doctor-patient.assign:any`                 | `SUPER_ADMIN`, `ADMIN`            |
| `DELETE /api/v1/doctor-patient-assignments/:id`  | `doctor-patient.unassign:any`               | `SUPER_ADMIN`, `ADMIN`            |
| `GET /api/v1/doctor-patient-assignments/activity` | `doctor-patient.activity.read:any`         | `SUPER_ADMIN`, `ADMIN`            |

Assignment contract notes:

- Create accepts `{ doctorId, patientId }`, is idempotent for an already-active pair, and returns the active assignment.
- Delete performs an audited unassignment (`unassignedAt`, `unassignedById`) rather than deleting history.
- Assign and unassign transactions append immutable `ASSIGNED` or `UNASSIGNED` activity events.
- The activity endpoint is paginated, supports `doctorId`, `patientId`, `action`, `actorUserId`, `occurredFrom`, and `occurredTo` filters, and returns each event with its assignment, actor, action, and occurrence timestamp.
- Each assignment lifecycle is retained as a history record. Reassignment creates a new record and never reactivates or overwrites a previously unassigned record.
- Appointments, registrations, and prescriptions never create or remove the assignment implicitly.
- Doctor `patient.read:own` is satisfied only by an active assignment to the authenticated doctor's profile.

### Appointment Management

| Endpoint                                | Permission                                           | Default Roles                                                           |
| --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/appointments`              | `appointment.read:any` or `appointment.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)                       |
| `GET /api/v1/appointments/:id`          | `appointment.read:any` or `appointment.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)                       |
| `POST /api/v1/appointments`             | `appointment.create:any` or `appointment.create:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own) — doctors do not book           |
| `PATCH /api/v1/appointments/:id`        | `appointment.update:any` or `appointment.update:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own, limited fields) |
| `POST /api/v1/appointments/:id/cancel`  | `appointment.cancel:any` or `appointment.cancel:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own)                 |
| `POST /api/v1/appointments/:id/approve` | `appointment.approve:any`                            | `SUPER_ADMIN`, `ADMIN`                                                  |
| `POST /api/v1/appointments/:id/reject`  | `appointment.approve:any`                            | `SUPER_ADMIN`, `ADMIN`                                                  |
| `GET /api/v1/doctors/:id/sessions`      | `appointment.session.read:any` or `:own`             | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT`                       |
| `GET /api/v1/appointment-sessions`      | `appointment.session.read:any` or `:own`             | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT`                       |
| `GET /api/v1/appointment-sessions/:id/queue` | `appointment.session.read:any` or `:own`        | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT`                       |
| `PATCH /api/v1/appointment-sessions/:id` | `appointment.session.update:any`                    | `SUPER_ADMIN`, `ADMIN`                                                  |

Appointment scheduling model (session-based — see [docs/revamp/appointment-scheduling.md](../revamp/appointment-scheduling.md)):

- `POST /appointments` takes a discriminated body by `type`. `SESSION` joins a doctor's practice session (`{ doctorId, patientId, scheduleId, sessionDate }`) — no exact time can be chosen. `SPECIAL_REQUEST` asks for an exact instant (`{ doctorId, patientId, requestedAt, reason }`, reason mandatory) and is created as `REQUESTED` until clinic staff approve or reject it; creators holding `appointment.approve:any` are scheduled immediately.
- Sessions are lazily materialized occurrences of weekly schedule windows with limited (`maxPatients`) or unlimited capacity. Booking rejects full (`409`), non-open, duplicate-patient, and inside-cutoff attempts (booking closes 60 minutes before session start).
- Patient-initiated special requests must be at least 3 days in advance; approvers may book closer in.
- Queue numbers are assigned at check-in (registration flow `CHECKED_IN`), first come first served — a booking is only a participation record. Session bookings cannot be rescheduled to an exact timestamp; cancel and rebook instead.
- All schedule windows and session times are wall-clock values in the clinic timezone (`CLINIC_TIMEZONE` env, default `Asia/Jakarta`); the API converts instants before validating.
- `GET /appointment-sessions?from&to` projects sessions for every active doctor (for calendar display); `GET /doctors/:id/sessions` scopes to one doctor; both return `bookedCount`/`remaining`. Date ranges are capped at 92 days.

### Registration Flow

| Endpoint                          | Permission                                             | Default Roles                                           |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `GET /api/v1/registrations`       | `registration.read:any` or `registration.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)       |
| `GET /api/v1/registrations/:id`   | `registration.read:any` or `registration.read:own`     | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` (own)       |
| `POST /api/v1/registrations`      | `registration.create:any` or `registration.create:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own)                 |
| `PATCH /api/v1/registrations/:id` | `registration.update:any` or `registration.update:own` | `SUPER_ADMIN`, `ADMIN`, `PATIENT` (own, limited fields) |

### Pharmacy Flow

| Endpoint                     | Permission                                           | Default Roles                                  |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `GET /api/v1/medications`    | `medication.read:any`                                | `SUPER_ADMIN`, `ADMIN`, `PHARMACIST`, `DOCTOR` |
| `POST /api/v1/prescriptions` | `prescription.write:any` or `prescription.write:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`               |
| `POST /api/v1/dispenses`     | `dispense.write:any`                                 | `SUPER_ADMIN`, `ADMIN`, `PHARMACIST`           |

### AI Chatbot (Post-MVP — deferred)

See [docs/post-mvp/ai-chatbot.md](../post-mvp/ai-chatbot.md). Endpoints below are planned for Phase 13, not MVP release.

| Endpoint                                  | Permission                                         | Default Roles                                           |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/v1/chat/sessions`              | `chat.session.create:own`                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`             |
| `POST /api/v1/chat/sessions/:id/messages` | `chat.message.create:own`                          | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`             |
| `GET /api/v1/chat/sessions/:id/messages`  | `chat.message.read:any` or `chat.message.read:own` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR` (own), `PATIENT` (own) |
