# HMS Database Guidelines (PostgreSQL + Prisma)

## 1. Database Principles

- PostgreSQL is the single source of truth for MVP transactional data.
- Prisma latest stable is the only ORM and migration tool (currently `prisma@7.8.0` + `@prisma/client@7.8.0`).
- Every schema change must be migration-driven and reviewable.
- RBAC follows an IAM-style role model: admins assign/unassign roles to users.
- Prisma v7 requires adapter-based runtime setup (`@prisma/adapter-pg` with `pg`) and explicit client generation/output configuration.

## 2. IAM-Style RBAC Data Model

- `Role` defines reusable role identities (`SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PHARMACIST`, `PATIENT`).
- `Permission` defines action-based capabilities (`resource.action:scope`).
- `RolePermission` maps roles to permissions.
- `UserRole` is the role binding table; role assignment/unassignment is admin-managed.
- `UserRole.assignedById` and `UserRole.unassignedById` keep accountability for changes.

Permission scope meaning:

- `ANY`: permission applies to all records in a resource (example: `appointment.read:any`).
- `OWN`: permission applies only to records owned by the current user (example: `appointment.read:own`).
- `OWN` must be enforced in backend query filters/policies, not only via frontend visibility rules.

## 3. Prisma Schema (Baseline)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum PermissionScope {
  ANY
  OWN
}

enum Gender {
  MALE
  FEMALE
}

enum AppointmentStatus {
  REQUESTED
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  REJECTED
  NO_SHOW
}

enum AppointmentType {
  SESSION
  SPECIAL_REQUEST
}

enum AppointmentSessionStatus {
  OPEN
  CLOSED
  CANCELLED
}

enum RegistrationStatus {
  PENDING
  CHECKED_IN
  COMPLETED
  CANCELLED
}

enum PrescriptionStatus {
  DRAFT
  ISSUED
  PARTIALLY_DISPENSED
  DISPENSED
  CANCELLED
}

enum DispenseStatus {
  DISPENSED
  CANCELLED
}

enum AiProviderKind {
  OPENAI
  DEEPSEEK
  ANTHROPIC
  OLLAMA
  OPENAI_COMPATIBLE
  AZURE_OPENAI
}

enum ChatChannel {
  PATIENT
  DOCTOR
}

enum ChatActor {
  USER
  ASSISTANT
  SYSTEM
}

enum DoctorPatientActivityAction {
  ASSIGNED
  UNASSIGNED
}

model User {
  id                   String           @id @default(uuid()) @db.Uuid
  email                String           @unique
  passwordHash         String           @map("password_hash")
  isActive             Boolean          @default(true) @map("is_active")
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")
  deletedAt            DateTime?        @map("deleted_at")

  roles                UserRole[]
  assignedRoles        UserRole[]       @relation("RoleAssignedBy")
  unassignedRoles      UserRole[]       @relation("RoleUnassignedBy")
  createdAppointments  Appointment[]    @relation("AppointmentCreatedBy")
  createdRegistrations Registration[]   @relation("RegistrationCreatedBy")
  dispensedByRecords   DispenseRecord[] @relation("DispensePharmacist")
  assignedDoctorPatients DoctorPatient[] @relation("DoctorPatientAssignedBy")
  unassignedDoctorPatients DoctorPatient[] @relation("DoctorPatientUnassignedBy")
  doctorPatientActivities DoctorPatientActivity[] @relation("DoctorPatientActivityActor")

  patientProfile       PatientProfile?
  doctorProfile        DoctorProfile?
  chatSessions         ChatSession[]    @relation("ChatSessionOwner")
  chatMessages         ChatMessage[]    @relation("ChatMessageAuthor")

  @@map("users")
}

model Role {
  id          String           @id @default(uuid()) @db.Uuid
  code        String           @unique
  name        String
  description String?
  isSystem    Boolean          @default(false) @map("is_system")
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")
  deletedAt   DateTime?        @map("deleted_at")

  users       UserRole[]
  permissions RolePermission[]

  @@map("roles")
}

model Permission {
  id          String           @id @default(uuid()) @db.Uuid
  key         String           @unique @map("permission_key")
  resource    String
  action      String
  scope       PermissionScope
  description String?
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")

  roles       RolePermission[]

  @@index([resource, action, scope])
  @@map("permissions")
}

model RolePermission {
  id           String      @id @default(uuid()) @db.Uuid
  roleId       String      @db.Uuid @map("role_id")
  permissionId String      @db.Uuid @map("permission_id")
  createdAt    DateTime    @default(now()) @map("created_at")

  role         Role        @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission  @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionId])
  @@index([roleId])
  @@index([permissionId])
  @@map("role_permissions")
}

model UserRole {
  id             String    @id @default(uuid()) @db.Uuid
  userId         String    @db.Uuid @map("user_id")
  roleId         String    @db.Uuid @map("role_id")
  assignedById   String?   @db.Uuid @map("assigned_by_id")
  assignedAt     DateTime  @default(now()) @map("assigned_at")
  unassignedById String?   @db.Uuid @map("unassigned_by_id")
  unassignedAt   DateTime? @map("unassigned_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           Role      @relation(fields: [roleId], references: [id], onDelete: Restrict)
  assignedBy     User?     @relation("RoleAssignedBy", fields: [assignedById], references: [id], onDelete: SetNull)
  unassignedBy   User?     @relation("RoleUnassignedBy", fields: [unassignedById], references: [id], onDelete: SetNull)

  @@unique([userId, roleId])
  @@index([userId])
  @@index([roleId])
  @@index([deletedAt])
  @@map("user_roles")
}

model PatientProfile {
  id                  String         @id @default(uuid()) @db.Uuid
  userId              String         @unique @db.Uuid @map("user_id")
  medicalRecordNumber String         @unique @map("medical_record_number")
  fullName            String         @map("full_name")
  identificationNumber String        @unique @map("identification_number")
  dateOfBirth         DateTime       @map("date_of_birth")
  gender              Gender
  phone               String         @unique
  address             Json?
  emergencyContact    Json?          @map("emergency_contact")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")
  deletedAt           DateTime?      @map("deleted_at")

  user                User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointments        Appointment[]
  registrations       Registration[]
  prescriptions       Prescription[]
  doctors             DoctorPatient[]

  @@map("patient_profiles")
}

model DoctorProfile {
  id                   String           @id @default(uuid()) @db.Uuid
  userId               String           @unique @db.Uuid @map("user_id")
  licenseNumber        String           @unique @map("license_number")
  identificationNumber String           @unique @map("identification_number")
  fullName             String           @map("full_name")
  specialty            String
  phone                String           @unique
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")
  deletedAt            DateTime?        @map("deleted_at")

  user                 User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  schedules            DoctorSchedule[]
  appointments         Appointment[]
  prescriptions        Prescription[]
  patients             DoctorPatient[]

  @@map("doctor_profiles")
}

model DoctorPatient {
  id             String         @id @default(uuid()) @db.Uuid
  doctorId       String         @db.Uuid @map("doctor_id")
  patientId      String         @db.Uuid @map("patient_id")
  assignedById   String?        @db.Uuid @map("assigned_by_id")
  assignedAt     DateTime       @default(now()) @map("assigned_at")
  unassignedById String?        @db.Uuid @map("unassigned_by_id")
  unassignedAt   DateTime?      @map("unassigned_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  doctor         DoctorProfile  @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  patient        PatientProfile @relation(fields: [patientId], references: [id], onDelete: Restrict)
  assignedBy     User?          @relation("DoctorPatientAssignedBy", fields: [assignedById], references: [id], onDelete: SetNull)
  unassignedBy   User?          @relation("DoctorPatientUnassignedBy", fields: [unassignedById], references: [id], onDelete: SetNull)
  activities     DoctorPatientActivity[]

  @@index([doctorId, unassignedAt])
  @@index([patientId, unassignedAt])
  @@index([assignedById])
  @@index([unassignedById])
  @@index([assignedAt])
  @@index([unassignedAt])
  @@map("doctor_patients")
}

model DoctorPatientActivity {
  id           String                      @id @default(uuid()) @db.Uuid
  assignmentId String                      @db.Uuid @map("assignment_id")
  action       DoctorPatientActivityAction
  actorUserId  String                      @db.Uuid @map("actor_user_id")
  occurredAt   DateTime                    @default(now()) @map("occurred_at")

  assignment   DoctorPatient               @relation(fields: [assignmentId], references: [id], onDelete: Restrict)
  actor        User                        @relation("DoctorPatientActivityActor", fields: [actorUserId], references: [id], onDelete: Restrict)

  @@index([assignmentId, occurredAt])
  @@index([actorUserId, occurredAt])
  @@index([action, occurredAt])
  @@index([occurredAt])
  @@map("doctor_patient_activities")
}

model DoctorSchedule {
  id          String        @id @default(uuid()) @db.Uuid
  doctorId    String        @db.Uuid @map("doctor_id")
  dayOfWeek   Int           @map("day_of_week")
  startTime   String        @map("start_time")
  endTime     String        @map("end_time")
  isAvailable Boolean       @default(true) @map("is_available")
  maxPatients Int?          @map("max_patients")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  doctor      DoctorProfile        @relation(fields: [doctorId], references: [id], onDelete: Cascade)
  sessions    AppointmentSession[]

  @@index([doctorId, dayOfWeek])
  @@map("doctor_schedules")
}

model AppointmentSession {
  id          String                   @id @default(uuid()) @db.Uuid
  doctorId    String                   @db.Uuid @map("doctor_id")
  scheduleId  String?                  @db.Uuid @map("schedule_id")
  sessionDate DateTime                 @map("session_date") @db.Date
  startTime   String                   @map("start_time")
  endTime     String                   @map("end_time")
  maxPatients Int?                     @map("max_patients")
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

model Appointment {
  id           String            @id @default(uuid()) @db.Uuid
  patientId    String            @db.Uuid @map("patient_id")
  doctorId     String            @db.Uuid @map("doctor_id")
  type         AppointmentType   @default(SESSION)
  sessionId    String?           @db.Uuid @map("session_id")
  queueNumber  Int?              @map("queue_number")
  scheduledAt  DateTime          @map("scheduled_at")
  status       AppointmentStatus @default(SCHEDULED)
  reason       String?
  notes        String?
  createdById  String?           @db.Uuid @map("created_by_id")
  createdAt    DateTime          @default(now()) @map("created_at")
  updatedAt    DateTime          @updatedAt @map("updated_at")
  deletedAt    DateTime?         @map("deleted_at")

  patient      PatientProfile      @relation(fields: [patientId], references: [id], onDelete: Restrict)
  doctor       DoctorProfile       @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  session      AppointmentSession? @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  createdBy    User?               @relation("AppointmentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  registration Registration?

  @@unique([sessionId, queueNumber])
  @@index([doctorId, scheduledAt])
  @@index([patientId, scheduledAt])
  @@index([status, scheduledAt])
  @@index([sessionId])
  @@map("appointments")
}

model Registration {
  id            String             @id @default(uuid()) @db.Uuid
  patientId     String             @db.Uuid @map("patient_id")
  appointmentId String?            @unique @db.Uuid @map("appointment_id")
  status        RegistrationStatus @default(PENDING)
  registeredAt  DateTime           @default(now()) @map("registered_at")
  checkedInAt   DateTime?          @map("checked_in_at")
  completedAt   DateTime?          @map("completed_at")
  createdById   String?            @db.Uuid @map("created_by_id")
  createdAt     DateTime           @default(now()) @map("created_at")
  updatedAt     DateTime           @updatedAt @map("updated_at")
  deletedAt     DateTime?          @map("deleted_at")

  patient       PatientProfile     @relation(fields: [patientId], references: [id], onDelete: Restrict)
  appointment   Appointment?       @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  createdBy     User?              @relation("RegistrationCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([patientId, status])
  @@index([status, registeredAt])
  @@map("registrations")
}

model Medication {
  id                String                   @id @default(uuid()) @db.Uuid
  code              String                   @unique
  name              String
  form              String?
  strength          String?
  unit              String?
  stockQty          Int                      @default(0) @map("stock_qty")
  createdAt         DateTime                 @default(now()) @map("created_at")
  updatedAt         DateTime                 @updatedAt @map("updated_at")
  deletedAt         DateTime?                @map("deleted_at")

  prescriptionItems PrescriptionMedication[]
  dispenseItems     DispenseItem[]

  @@map("medications")
}

model Prescription {
  id              String                   @id @default(uuid()) @db.Uuid
  patientId       String                   @db.Uuid @map("patient_id")
  doctorId        String                   @db.Uuid @map("doctor_id")
  status          PrescriptionStatus       @default(DRAFT)
  issuedAt        DateTime?                @map("issued_at")
  notes           String?
  createdAt       DateTime                 @default(now()) @map("created_at")
  updatedAt       DateTime                 @updatedAt @map("updated_at")
  deletedAt       DateTime?                @map("deleted_at")

  patient         PatientProfile           @relation(fields: [patientId], references: [id], onDelete: Restrict)
  doctor          DoctorProfile            @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  items           PrescriptionMedication[]
  dispenseRecords DispenseRecord[]

  @@index([patientId, status])
  @@index([doctorId, status])
  @@map("prescriptions")
}

model PrescriptionMedication {
  id             String         @id @default(uuid()) @db.Uuid
  prescriptionId String         @db.Uuid @map("prescription_id")
  medicationId   String         @db.Uuid @map("medication_id")
  dosage         String
  frequency      String
  durationDays   Int?           @map("duration_days")
  quantity       Int
  instructions   String?
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  prescription   Prescription   @relation(fields: [prescriptionId], references: [id], onDelete: Cascade)
  medication     Medication     @relation(fields: [medicationId], references: [id], onDelete: Restrict)

  @@index([prescriptionId])
  @@index([medicationId])
  @@map("prescription_medications")
}

model DispenseRecord {
  id             String         @id @default(uuid()) @db.Uuid
  prescriptionId String         @db.Uuid @map("prescription_id")
  pharmacistId   String         @db.Uuid @map("pharmacist_id")
  dispensedAt    DateTime       @default(now()) @map("dispensed_at")
  status         DispenseStatus @default(DISPENSED)
  notes          String?
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  prescription   Prescription   @relation(fields: [prescriptionId], references: [id], onDelete: Restrict)
  pharmacist     User           @relation("DispensePharmacist", fields: [pharmacistId], references: [id], onDelete: Restrict)
  items          DispenseItem[]

  @@index([prescriptionId])
  @@index([pharmacistId])
  @@index([status, dispensedAt])
  @@map("dispense_records")
}

model DispenseItem {
  id              String         @id @default(uuid()) @db.Uuid
  dispenseRecordId String        @db.Uuid @map("dispense_record_id")
  medicationId    String         @db.Uuid @map("medication_id")
  quantity        Int
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")

  dispenseRecord  DispenseRecord @relation(fields: [dispenseRecordId], references: [id], onDelete: Cascade)
  medication      Medication     @relation(fields: [medicationId], references: [id], onDelete: Restrict)

  @@unique([dispenseRecordId, medicationId])
  @@index([medicationId])
  @@map("dispense_items")
}

model ChatSession {
  id                String         @id @default(uuid()) @db.Uuid
  ownerUserId       String         @db.Uuid @map("owner_user_id")
  channel           ChatChannel    @default(PATIENT)
  providerKey       String         @map("provider_key")
  providerKind      AiProviderKind @map("provider_kind")
  providerSessionId String?        @map("provider_session_id")
  providerMetadata  Json?          @map("provider_metadata")
  title             String?
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")
  deletedAt         DateTime?      @map("deleted_at")

  ownerUser         User           @relation("ChatSessionOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  messages          ChatMessage[]

  @@index([ownerUserId])
  @@index([providerKey])
  @@index([channel])
  @@map("chat_sessions")
}

model ChatMessage {
  id                 String          @id @default(uuid()) @db.Uuid
  sessionId          String          @db.Uuid @map("session_id")
  authorUserId       String?         @db.Uuid @map("author_user_id")
  actor              ChatActor
  content            String          @db.Text
  providerKind       AiProviderKind? @map("provider_kind")
  providerRequestId  String?         @map("provider_request_id")
  providerMessageId  String?         @map("provider_message_id")
  providerModel      String?         @map("provider_model")
  providerStatusCode Int?            @map("provider_status_code")
  providerLatencyMs  Int?            @map("provider_latency_ms")
  providerMetadata   Json?           @map("provider_metadata")
  disclaimerShown    Boolean         @default(false) @map("disclaimer_shown")
  safetyTags         Json?           @map("safety_tags")
  createdAt          DateTime        @default(now()) @map("created_at")

  session            ChatSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorUser         User?           @relation("ChatMessageAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([sessionId, createdAt])
  @@index([authorUserId])
  @@index([providerRequestId])
  @@index([providerMessageId])
  @@map("chat_messages")
}
```

Snake case rule for database naming:

- All PostgreSQL table names use `snake_case` via `@@map("...")`.
- All PostgreSQL column names use `snake_case` via `@map("...")`.
- Prisma model and field names can remain `PascalCase`/`camelCase` for TypeScript ergonomics.

External AI audit requirement:

- Store provider request/message identifiers and latency/status metadata for traceability.
- Keep provider credential values out of the database (store only non-secret metadata).

Doctor-patient assignment requirements:

- `DoctorPatient` is the explicit many-to-many assignment between `DoctorProfile` and `PatientProfile`; appointments and prescriptions do not implicitly create this relationship.
- An assignment is active when `unassignedAt` is `null`. Unassignment records the actor and timestamp instead of deleting audit history.
- Each `DoctorPatient` row represents one assignment lifecycle. Once unassigned, the row remains immutable history; reassignment creates a new row with a new identifier.
- `DoctorPatientActivity` is an append-only event log. Assignment and unassignment transactions append `ASSIGNED` and `UNASSIGNED` records respectively; activity rows are never updated or deleted through normal application flows.
- Actor and assignment foreign keys use `onDelete: Restrict` so retention or purge workflows cannot silently erase audit attribution.
- Add a partial unique index in migration SQL on `(doctor_id, patient_id) WHERE unassigned_at IS NULL` to prevent duplicate active assignments while allowing reassignment history.
- Creating a patient may include optional `doctorIds`; creating a doctor may include optional `patientIds`. The service validates all referenced active profiles before writing any record.
- Profile creation and initial assignments run in one transaction. If any relation is invalid or duplicated, the entire create operation fails.
- List queries return relation counts or compact summaries and support `doctorId`/`patientId` filters. Detail queries return active related profiles through explicit Prisma `select` projections.
- Doctor `patient.read:own` access means the requested patient has an active `DoctorPatient` assignment to that doctor's profile. Patient access to related doctors uses the same active-assignment constraint.
- The assignment activity API reads `DoctorPatientActivity` and exposes paginated events with doctor, patient, actor, action, and date-range filters. Timestamp, action, actor, and assignment indexes support these audit queries.

S3-backed file storage requirements:

- Add object-key fields only to domain records that own files; the common S3 provider does not require a generic storage table.
- The private object key is the authoritative identifier used for retrieval and deletion. Never persist permanent, unsigned, or signed S3 URLs.
- Feature services own upload, replacement, and deletion workflows by injecting the common object-storage provider.
- Every S3-backed URL in an API response is generated as a short-lived signed URL and includes expiry metadata.
- Replacing a file uploads the new object first, updates the owning record, then deletes the previous object. Failed cleanup is retried asynchronously and must not roll back an already successful domain update.
- Object keys must be generated by the backend and must not contain email addresses, medical record numbers, names, or other PII.

Prisma v7 config note:

- Keep datasource URL and migration settings in `prisma.config.ts` (project root or API workspace root).
- Run `prisma generate` explicitly after schema changes.

## 4. Soft Delete Implementation

Soft-delete policy:

- Use Prisma field `deletedAt` (`DateTime?`) mapped to DB column `deleted_at` as the canonical soft-delete flag.
- Soft delete means `deletedAt = now()`; restore means `deletedAt = null`.
- Default all read queries to active records only (`where: { deletedAt: null }`).
- Hard delete is restricted to retention/purge jobs and never used in normal business flows.

PrismaService strategy (required):

- Centralize soft-delete behavior in `apps/api/src/common/prisma/prisma.service.ts`.
- Add reusable methods in PrismaService so repositories do not duplicate logic.
- Repositories call PrismaService helpers instead of writing ad-hoc `deletedAt` filters.
- PrismaService must instantiate Prisma Client using Prisma v7 adapter-based constructor.
- Keep Prisma helper delegate/arg utility types in `apps/api/src/common/prisma/prisma.types.ts` to keep service implementation focused.
- Read DB connection env from Nest `ConfigService` in PrismaService (avoid direct `process.env` in service logic).

Recommended PrismaService contract:

- `softDelete(model, where, actorId?)`
- `restore(model, where, actorId?)`
- `findManyActive(model, args?)`
- `findFirstActive(model, args?)`
- `findUniqueActive(model, args)`
- `hardDelete(model, where)`
- `executeTransaction(fn)`

Example strategy in `prisma.service.ts`:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { FindManyDelegate, UpdateDelegate, UpdateWhere } from './prisma.types';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>('DATABASE_URL') ??
      'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async softDelete<TDelegate extends UpdateDelegate>(
    model: TDelegate,
    where: UpdateWhere<TDelegate>,
  ) {
    return model.update({
      where,
      data: { deletedAt: new Date() },
    });
  }

  async findManyActive<TDelegate extends FindManyDelegate>(
    model: TDelegate,
    args?: Prisma.Args<TDelegate, 'findMany'>,
  ) {
    const typedArgs = (args ?? {}) as Record<string, unknown>;
    const where = (typedArgs.where as Record<string, unknown> | undefined) ?? {};

    return model.findMany({
      ...typedArgs,
      where: {
        ...where,
        deletedAt: null,
      },
    } as Prisma.Args<TDelegate, 'findMany'>);
  }
}
```

Repository usage pattern:

```ts
return this.prisma.findManyActive(this.prisma.patientProfile, {
  where: filters,
});

await this.prisma.softDelete(this.prisma.patientProfile, { id });
```

Unique constraint note:

- For fields that must be reusable after soft delete (example: email/license/MRN), implement **partial unique indexes** in SQL migrations (`WHERE deleted_at IS NULL`).
- Prisma schema remains the source for model shape, while partial index DDL can be added directly in migration SQL files.
- Apply the same migration-SQL approach to the active `DoctorPatient` assignment uniqueness constraint (`WHERE unassigned_at IS NULL`).

## 5. Migration Rules

- One concern per migration.
- Keep migrations small and reversible.
- Do not mix unrelated schema changes in one migration.
- Validate migration status in CI before merge.

## 6. Transaction Boundaries

Use explicit transactions for multi-write flows:

- Appointment booking/rescheduling/cancellation
- Registration intake workflows
- Prescription + dispense workflows
- Role assignment/unassignment and permission changes
- Patient/doctor creation with initial `DoctorPatient` assignments
- Doctor-patient assignment/unassignment lifecycle updates plus append-only activity records
- Feature-owned file metadata replacement; S3 operations remain outside database transactions and use compensating cleanup
