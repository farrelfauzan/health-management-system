# Phase 3 Backend-to-Frontend Handoff

## Contract source

- Runtime contract: `GET /api/openapi.yaml`
- Committed contract: `apps/api/openapi.yaml`
- Shared request validation and response types: `packages/shared-types/src`
- Generated web client: `apps/web/lib/api/generated`
- Synchronization command: `pnpm api:contract:sync` while the API is running on port `3001`
- Base path: `/api/v1`
- Authentication: `Authorization: Bearer <access-token>`

Generated files are not edited manually. Frontend features consume the Orval-generated TanStack Query client and use shared Zod schemas for forms.

## Response and error envelopes

Successful single-resource mutations and reads return:

```json
{
  "data": {},
  "message": "Optional mutation result"
}
```

List operations return:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

Errors return:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Clients must handle `401` by invoking the centralized refresh/sign-out flow, render `403` as an unavailable action, render `404` as a missing resource, and surface actionable `400` or `409` validation and conflict messages.

## Endpoint catalog

### Admin management

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/users` | `user.read:any` | `listUsersQuerySchema` | `AdminUser[]`, `AdminUsersListMeta` |
| POST | `/users` | `user.create:any` | `createAdminUserSchema` | `AdminUser` |
| PATCH | `/users/:id` | `user.update:any` | `updateAdminUserSchema` | `AdminUser` |

### Patient management

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/patients` | `patient.read:any\|own` | `listPatientsQuerySchema` | `PatientListItem[]`, `PatientsListMeta` |
| GET | `/patients/:id` | `patient.read:any\|own` | UUID path | `PatientDetail` |
| POST | `/patients` | `patient.create:any` | `createPatientSchema` | `PatientProfile` |
| PATCH | `/patients/:id` | `patient.update:any\|own` | `updatePatientSchema` | `PatientProfile` |

Patient creation and initial `doctorIds` assignments are atomic. Own-scoped doctors see actively assigned patients only. A patient sees only the profile linked to their authenticated user.

### Doctor management

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/doctors` | `doctor.read:any` | `listDoctorsQuerySchema` | `DoctorListItem[]`, `DoctorsListMeta` |
| GET | `/doctors/:id` | `doctor.read:any` | UUID path | `DoctorDetail` |
| POST | `/doctors` | `doctor.create:any` | `createDoctorSchema` | `DoctorProfile` |
| PATCH | `/doctors/:id/schedule` | `doctor.schedule.write:any\|own` | `updateDoctorScheduleSchema` | `DoctorScheduleEntry[]` |

Schedule entries use `dayOfWeek` values from `0` (Sunday) through `6` (Saturday) and `HH:mm` times. Overlapping entries are rejected.

### Doctor-patient assignments

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| POST | `/doctor-patient-assignments` | `doctor-patient.assign:any` | `createDoctorPatientAssignmentSchema` | `DoctorPatientAssignment` |
| GET | `/doctor-patient-assignments/activity` | `doctor-patient.activity.read:any` | `listDoctorPatientActivityQuerySchema` | `DoctorPatientActivityEvent[]`, list meta |
| DELETE | `/doctor-patient-assignments/:id` | `doctor-patient.unassign:any` | UUID path | `DoctorPatientAssignment` |

Assign and unassign operations are idempotent. Unassignment preserves the assignment record and appends an immutable activity event.

### Appointment management

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/appointments` | `appointment.read:any\|own` | `listAppointmentsQuerySchema` | `AppointmentListItem[]`, `AppointmentsListMeta` |
| GET | `/appointments/:id` | `appointment.read:any\|own` | UUID path | `AppointmentResponse` |
| POST | `/appointments` | `appointment.create:any\|own` | `createAppointmentSchema` | `AppointmentResponse` |
| PATCH | `/appointments/:id` | `appointment.update:any\|own` | `updateAppointmentSchema` | `AppointmentResponse` |
| POST | `/appointments/:id/cancel` | `appointment.cancel:any\|own` | `cancelAppointmentSchema` | `AppointmentResponse` |

The API validates doctor availability, participant ownership, conflicts, and status transitions. The frontend must not infer a successful transition before the mutation response.

### Registration flow

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/registrations` | `registration.read:any\|own` | `listRegistrationsQuerySchema` | `RegistrationListItem[]`, `RegistrationsListMeta` |
| GET | `/registrations/:id` | `registration.read:any\|own` | UUID path | `RegistrationResponse` |
| POST | `/registrations` | `registration.create:any\|own` | `createRegistrationSchema` | `RegistrationResponse` |
| PATCH | `/registrations/:id` | `registration.update:any\|own` | `updateRegistrationSchema` | `RegistrationResponse` |

Patients can mutate only fields allowed by own-scope rules. Status transitions and appointment/patient relationships remain server-authoritative.

### Pharmacy flow

| Method | Path | Permission | Request schema | Response contract |
| --- | --- | --- | --- | --- |
| GET | `/medications` | `medication.read:any` | `listMedicationsQuerySchema` | `MedicationResponse[]`, `MedicationsListMeta` |
| POST | `/prescriptions` | `prescription.write:any\|own` | `createPrescriptionSchema` | `PrescriptionResponse` |
| POST | `/dispenses` | `dispense.write:any` | `createDispenseSchema` | `DispenseRecordResponse` |

Dispensing is transactional. The client must treat `409` stock and remaining-quantity conflicts as a failed mutation and refresh medication and prescription queries.

## Pagination and filtering

All Phase 3 list endpoints use page pagination:

- `page`: integer, minimum `1`, default `1`
- `limit`: integer, range `1..100`, default `10`
- `meta.total`: total records visible under the caller's permission scope

Supported filters:

- users: `search`, `roleCode`, `isActive`
- patients: `search`, `doctorId`, `isActive`
- doctors: `search`, `patientId`, `specialty`, `isActive`
- assignment activity: `doctorId`, `patientId`, `action`, `actorUserId`, `occurredFrom`, `occurredTo`
- appointments: `status`, `doctorId`, `patientId`, `scheduledFrom`, `scheduledTo`
- registrations: `status`, `patientId`, `registeredFrom`, `registeredTo`
- medications: `search`

IDs are UUIDs. Date-time values are ISO 8601 strings with an offset. `dateOfBirth` is a date-only `YYYY-MM-DD` value. A range start must be earlier than or equal to its range end.

## API stability checklist

- [x] All 26 Phase 3 controller operations have OpenAPI summaries, bearer security, and success examples.
- [x] Body operations have request examples and shared Zod-backed DTO schemas.
- [x] Every Phase 3 endpoint declares action/resource permission metadata.
- [x] Default permissions are present in the RBAC seed policy.
- [x] `apps/api/openapi.yaml` has been regenerated from the current application.
- [x] Orval output has been regenerated from the committed contract.
- [x] Lint passes.
- [x] Typecheck passes.
- [x] Unit tests pass.
- [x] Integration tests pass.
- [x] Build passes.

Any request or response shape change after this handoff requires an OpenAPI diff review, regenerated client output, and a compatibility note. Breaking changes require a new API version or a documented deprecation window.
