# Appointment & Doctor Scheduling Revamp

- **Status:** Phase A (schema + API) implemented on `feature/appointment-session-scheduling`; Phase B (web booking UX) pending
- **Scope:** `appointment-management`, `doctor-management` (schedules), `registration-flow` touchpoints, web booking UX
- **Supersedes:** the exact-time (`scheduledAt`) booking model described in [docs/MVP/api-contract.md](../MVP/api-contract.md) and [docs/MVP/database.md](../MVP/database.md)

## 1. Motivation

Today an appointment is a single exact timestamp (`scheduledAt`) validated against the doctor's weekly schedule windows. In practice consult duration inside the doctor's room is highly dynamic — a visit can take 5 minutes or 45 — so promising patients a precise clock time is misleading and creates avoidable conflicts (double-booking checks against an exact minute, timezone pitfalls, no-show disputes).

The clinic reality is **session-based**: a doctor opens a practice window (e.g. Monday 08:00–12:00), patients register into that window, and they are seen in queue order. Exact-time appointments should become the exception (a special request that the clinic explicitly approves), not the default.

## 2. Concepts

| Concept | Definition |
| --- | --- |
| **Doctor schedule** (unchanged) | Weekly recurring availability window per doctor: `dayOfWeek` + `startTime`–`endTime` wall-clock in the clinic timezone (`CLINIC_TIMEZONE`, default `Asia/Jakarta`). |
| **Session** | A concrete occurrence of one schedule window on one calendar date (Dr. A · Mon 2026-07-27 · 08:00–12:00). Sessions are the bookable unit. Each session has a patient capacity: **limited** (`maxPatients = N`) or **unlimited** (`maxPatients = null`). |
| **Session booking** (default method) | The patient joins a session — no specific time. They receive a queue number and attend anywhere inside the window. Confirmed immediately; no approval step. |
| **Special request** (exception method) | The patient asks for a specific condition (exact time, outside regular windows, longer consult, etc.). It starts as a request and requires clinic approval before it becomes a scheduled appointment. Future: approval/rejection notifies the patient via WhatsApp through the chatbot (post-MVP, see [docs/post-mvp/ai-chatbot.md](../post-mvp/ai-chatbot.md)). |

### Principles

1. Doctor scheduling stays exactly as implemented today (weekly windows, clinic-timezone wall-clock, `isAvailable` toggle). The revamp builds on top of it; it does not change it structurally.
2. Patients can never self-select an exact time. The only self-service path is joining a session. Exact-time needs go through the special-request approval flow.
3. Queue numbers are **first come, first served at the clinic**: a booking is only a record that the patient participates in the session; the queue number is assigned when the patient checks in (registration flow transitions to `CHECKED_IN`).
4. All session date/time math is done in the clinic timezone — same rule the availability fix established (`isWithinDoctorAvailability` + `CLINIC_TIMEZONE`).

## 3. Data Model Changes (Prisma)

### 3.1 `DoctorSchedule` — add default capacity

```prisma
model DoctorSchedule {
  // ...existing fields unchanged...
  maxPatients Int? @map("max_patients") // null = unlimited; default capacity for sessions spawned from this window
}
```

### 3.2 New: `AppointmentSession`

A session is materialized **lazily**: created on the first booking (or first staff action) for a `(doctorId, date, scheduleId)` combination, copying window times and capacity from the schedule at that moment. This avoids pre-generating rows for every future week and keeps schedule edits from silently rewriting already-booked sessions.

```prisma
enum AppointmentSessionStatus {
  OPEN
  CLOSED    // staff closed intake early (doctor left, emergency)
  CANCELLED // whole session cancelled; cascades cancellation to its bookings
}

model AppointmentSession {
  id          String                   @id @default(uuid()) @db.Uuid
  doctorId    String                   @map("doctor_id") @db.Uuid
  scheduleId  String?                  @map("schedule_id") @db.Uuid // origin window; SetNull if window deleted
  sessionDate DateTime                 @map("session_date") @db.Date
  startTime   String                   @map("start_time") // wall-clock copy, e.g. "08:00"
  endTime     String                   @map("end_time")
  maxPatients Int?                     @map("max_patients") // copied from schedule; staff-overridable per session
  status      AppointmentSessionStatus @default(OPEN)
  createdAt   DateTime                 @default(now()) @map("created_at")
  updatedAt   DateTime                 @updatedAt @map("updated_at")

  doctor       DoctorProfile   @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  schedule     DoctorSchedule? @relation(fields: [scheduleId], references: [id], onDelete: SetNull)
  appointments Appointment[]

  @@unique([doctorId, sessionDate, startTime])
  @@index([doctorId, sessionDate])
  @@map("appointment_sessions")
}
```

### 3.3 `Appointment` — two booking types

```prisma
enum AppointmentType {
  SESSION         // joined a session queue (default path)
  SPECIAL_REQUEST // exact-time/condition request, needs approval
}

enum AppointmentStatus {
  REQUESTED // new: special request awaiting clinic approval
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  REJECTED  // new: special request declined by clinic
  NO_SHOW
}

model Appointment {
  // ...existing fields...
  type        AppointmentType @default(SESSION)
  sessionId   String?         @map("session_id") @db.Uuid // required when type = SESSION
  queueNumber Int?            @map("queue_number")        // assigned at booking, per session
  scheduledAt DateTime        @map("scheduled_at")
  // SESSION: session date + window startTime (for sorting/calendar placement only)
  // SPECIAL_REQUEST: the exact requested/approved instant

  session AppointmentSession? @relation(fields: [sessionId], references: [id], onDelete: Restrict)

  @@unique([sessionId, queueNumber])
  @@unique([sessionId, patientId]) // one active booking per patient per session (partial index in migration: WHERE status NOT IN ('CANCELLED','REJECTED'))
}
```

`scheduledAt` stays non-null so existing sorting, calendar views, and list filters keep working for both types.

### 3.4 Status transitions

```
SESSION bookings:          SCHEDULED → CONFIRMED → COMPLETED
                           SCHEDULED/CONFIRMED → CANCELLED | NO_SHOW

SPECIAL_REQUEST bookings:  REQUESTED → SCHEDULED (approved) | REJECTED | CANCELLED (patient withdraws)
                           then same lifecycle as SESSION from SCHEDULED onward
```

`canTransitionAppointmentStatus` in `@hms/shared-types` gains the two new states; `REJECTED` is terminal.

## 4. Booking Flows

### 4.1 Join a session (default)

1. Patient/staff picks a doctor and a date; the API projects upcoming sessions from the weekly schedule (existing session rows merged with not-yet-materialized windows) with remaining capacity, e.g. `booked 7 / max 10` or `booked 12 / unlimited`.
2. **Booking closes 60 minutes before the session starts** (`SESSION_BOOKING_CUTOFF_MINUTES`, clinic timezone) — later attempts are rejected.
3. Booking a window get-or-creates the `AppointmentSession` and inserts the appointment inside one transaction:
   - reject if session `status != OPEN`;
   - reject if `maxPatients` is set and active bookings ≥ `maxPatients` → `"Session is full"`;
   - reject if the patient already has an active booking in this session;
   - the booking is a participation record only: `scheduledAt = session start`, `status = SCHEDULED`, **no queue number yet**.
4. Capacity checks run under the session row lock (`SELECT … FOR UPDATE`) to stay correct under concurrency.
5. On the day, check-in (registration flow → `CHECKED_IN`) assigns `queueNumber = max + 1` within the session, under the same session row lock — first come, first served at the clinic. The session queue endpoint lists checked-in patients first (by queue number), then not-yet-arrived bookings.

### 4.2 Special request (exception, approval required)

1. Patient submits doctor + exact requested datetime + reason (reason required for this type). No schedule-window validation — the point is to request something outside the normal rules. **Patient-initiated requests must be at least 3 days in advance** (`SPECIAL_REQUEST_MIN_LEAD_DAYS`); staff holding `appointment.approve` can create closer-in appointments directly.
2. Appointment is created as `type = SPECIAL_REQUEST`, `status = REQUESTED`. It holds no capacity and blocks nothing.
3. Clinic staff review from an approvals list:
   - **Approve** → status `SCHEDULED` (optionally adjusting the time); conflict check against other approved special requests applies at this moment.
   - **Reject** → status `REJECTED`, with a reason stored in `notes`.
4. **Notification hook (future):** approval/rejection emits a domain event (`appointment.request.approved` / `.rejected`). The WhatsApp chatbot integration (post-MVP Phase 13) subscribes to these events; until then the patient sees the outcome in the portal.

## 5. API Contract Changes

All under `/api/v1`, standard envelope.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/doctors/:id/sessions?from&to` | Bookable sessions in a date range, with `bookedCount`, `maxPatients`, `remaining` (`null` = unlimited), `status`. |
| `POST` | `/appointments` | Discriminated body by `type`: `SESSION` → `{ doctorId, patientId, sessionDate, scheduleId }`; `SPECIAL_REQUEST` → `{ doctorId, patientId, requestedAt, reason }`. Replaces free `scheduledAt` input. |
| `GET` | `/appointment-sessions/:id/queue` | Ordered queue for one session (staff + doctor view). |
| `PATCH` | `/appointment-sessions/:id` | Staff: override `maxPatients`, close or cancel the session. |
| `POST` | `/appointments/:id/approve` | Approve a special request (optional `scheduledAt` adjustment). |
| `POST` | `/appointments/:id/reject` | Reject a special request with a reason. |

Zod schemas live in `packages/shared-types/src/appointment-management/schemas.ts` (discriminated union on `type`); DTOs wrap them with `createZodDto` as usual; Orval regeneration via `pnpm api:contract:sync`.

### RBAC additions

| Permission | Granted to |
| --- | --- |
| `appointment.approve:ANY` | SUPER_ADMIN, front-desk/admin roles (covers approve + reject) |
| `appointment_session.read:ANY` | staff, doctors |
| `appointment_session.update:ANY` | staff (capacity override, close/cancel) |
| `appointment.create:OWN` | patients — both types, own bookings only (already the model today) |

## 6. Frontend Impact (`apps/web`)

- **Booking dialog** becomes two tabs: **“Join a session”** (doctor → date → session card showing window + `7/10 booked` → confirm; no time input) and **“Special request”** (doctor, exact date+time, mandatory reason, with copy explaining clinic approval is required).
- **Appointments calendar**: session bookings render as all-window entries grouped per session with queue counts; special requests keep exact-time placement, with `REQUESTED` shown as pending (distinct badge).
- **Approvals view** for staff: list of `REQUESTED` appointments with approve/reject actions (backend message toasts already wired).
- **Session queue view**: ordered patient list per session for front desk and doctors.
- All error paths reuse `notifyApiError` (top-right toast with backend message).

## 7. Migration & Rollout

1. **Migration 1 (additive):** new enums/values, `appointment_sessions` table, new `Appointment` columns (`type`, `session_id`, `queue_number`), `doctor_schedules.max_patients`. Backfill: existing appointments → `type = SPECIAL_REQUEST` with current status kept (they were staff-created exact-time bookings, which is what that type means).
2. **Phase A (API):** session projection + get-or-create booking, discriminated create, approve/reject endpoints, transition-map update in shared-types, unit + integration tests (concurrency test on capacity/queue assignment).
3. **Phase B (Web):** new booking dialog, sessions listing, approvals view, queue view; contract re-sync.
4. **Phase C (cleanup):** remove the old exact-time create path from the UI; `PATCH /appointments/:id` reschedule for SESSION type moves a booking to another session (re-queue) instead of editing a timestamp.
5. **Post-MVP:** WhatsApp chatbot subscribes to approval events (Phase 13, per D-007).

## 8. Resolved Decisions (product answers, 2026-07-23)

1. **Queue number = check-in order.** First come, first served at the clinic; the system booking is only a record of the patient participating in the session. Queue numbers are assigned at check-in (implemented in the registration flow).
2. **No default capacity.** `maxPatients` defaults to unlimited (`null`); the UI offers a limited/unlimited toggle and, when limited, an input for the patient count.
3. **Booking cutoff: 60 minutes before session start.** Patients cannot join once the cutoff passes (`SESSION_BOOKING_CUTOFF_MINUTES`, implemented).
4. **Waitlist: approved for a future phase.** When a limited session is full, patients will be able to join a waitlist and be promoted when capacity frees up. Not part of Phase A/B.
5. **Special requests: minimum 3 days in advance** for patient-initiated requests (`SPECIAL_REQUEST_MIN_LEAD_DAYS`, implemented); requests may target times outside any schedule window.
