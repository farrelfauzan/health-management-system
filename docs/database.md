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
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
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

enum ChatChannel {
  PATIENT
  DOCTOR
}

enum ChatActor {
  USER
  ASSISTANT
  SYSTEM
}

model User {
  id                    String          @id @default(uuid()) @db.Uuid
  email                 String          @unique
  passwordHash          String
  isActive              Boolean         @default(true)
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
  deletedAt             DateTime?

  roles                 UserRole[]
  assignedRoles         UserRole[]      @relation("RoleAssignedBy")
  unassignedRoles       UserRole[]      @relation("RoleUnassignedBy")
  createdAppointments   Appointment[]   @relation("AppointmentCreatedBy")
  createdRegistrations  Registration[]  @relation("RegistrationCreatedBy")
  dispensedByRecords    DispenseRecord[] @relation("DispensePharmacist")

  patientProfile        PatientProfile?
  doctorProfile         DoctorProfile?
  chatSessions          ChatSession[]   @relation("ChatSessionOwner")
  chatMessages          ChatMessage[]   @relation("ChatMessageAuthor")
}

model Role {
  id          String           @id @default(uuid()) @db.Uuid
  code        String           @unique
  name        String
  description String?
  isSystem    Boolean          @default(false)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  deletedAt   DateTime?

  users       UserRole[]
  permissions RolePermission[]
}

model Permission {
  id          String           @id @default(uuid()) @db.Uuid
  key         String           @unique
  resource    String
  action      String
  scope       PermissionScope
  description String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  roles       RolePermission[]

  @@index([resource, action, scope])
}

model RolePermission {
  id            String      @id @default(uuid()) @db.Uuid
  roleId        String      @db.Uuid
  permissionId  String      @db.Uuid
  createdAt     DateTime    @default(now())

  role          Role        @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission    Permission  @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionId])
  @@index([roleId])
  @@index([permissionId])
}

model UserRole {
  id              String     @id @default(uuid()) @db.Uuid
  userId          String     @db.Uuid
  roleId          String     @db.Uuid
  assignedById    String?    @db.Uuid
  assignedAt      DateTime   @default(now())
  unassignedById  String?    @db.Uuid
  unassignedAt    DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  deletedAt       DateTime?

  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  role            Role       @relation(fields: [roleId], references: [id], onDelete: Restrict)
  assignedBy      User?      @relation("RoleAssignedBy", fields: [assignedById], references: [id], onDelete: SetNull)
  unassignedBy    User?      @relation("RoleUnassignedBy", fields: [unassignedById], references: [id], onDelete: SetNull)

  @@unique([userId, roleId])
  @@index([userId])
  @@index([roleId])
  @@index([deletedAt])
}

model PatientProfile {
  id                   String         @id @default(uuid()) @db.Uuid
  userId               String         @unique @db.Uuid
  medicalRecordNumber  String         @unique
  fullName             String
  identificationNumber  String       @unique
  email                String        @unique
  dateOfBirth          DateTime
  gender               Gender
  phone                String        @unique
  address              Json?
  emergencyContact     Json?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
  deletedAt            DateTime?

  user                 User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  appointments         Appointment[]
  registrations        Registration[]
  prescriptions        Prescription[]
}

model DoctorProfile {
  id                  String          @id @default(uuid()) @db.Uuid
  userId              String          @unique @db.Uuid
  licenseNumber       String          @unique
  identificationNumber String          @unique
  email               String          @unique
  fullName            String
  specialty           String
  phone               String          @unique
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  deletedAt           DateTime?

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  schedules      DoctorSchedule[]
  appointments   Appointment[]
  prescriptions  Prescription[]
}

model DoctorSchedule {
  id          String       @id @default(uuid()) @db.Uuid
  doctorId    String       @db.Uuid
  dayOfWeek   Int
  startTime   String
  endTime     String
  isAvailable Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  doctor      DoctorProfile @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  @@index([doctorId, dayOfWeek])
}

model Appointment {
  id            String            @id @default(uuid()) @db.Uuid
  patientId     String            @db.Uuid
  doctorId      String            @db.Uuid
  scheduledAt   DateTime
  status        AppointmentStatus @default(SCHEDULED)
  reason        String?
  notes         String?
  createdById   String?           @db.Uuid
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  deletedAt     DateTime?

  patient       PatientProfile    @relation(fields: [patientId], references: [id], onDelete: Restrict)
  doctor        DoctorProfile     @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  createdBy     User?             @relation("AppointmentCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  registration  Registration?

  @@index([doctorId, scheduledAt])
  @@index([patientId, scheduledAt])
  @@index([status, scheduledAt])
}

model Registration {
  id            String             @id @default(uuid()) @db.Uuid
  patientId     String             @db.Uuid
  appointmentId String?            @unique @db.Uuid
  status        RegistrationStatus @default(PENDING)
  registeredAt  DateTime           @default(now())
  checkedInAt   DateTime?
  completedAt   DateTime?
  createdById   String?            @db.Uuid
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  deletedAt     DateTime?

  patient       PatientProfile     @relation(fields: [patientId], references: [id], onDelete: Restrict)
  appointment   Appointment?       @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  createdBy     User?              @relation("RegistrationCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([patientId, status])
  @@index([status, registeredAt])
}

model Medication {
  id              String                @id @default(uuid()) @db.Uuid
  code            String                @unique
  name            String
  form            String?
  strength        String?
  unit            String?
  stockQty        Int                   @default(0)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  deletedAt       DateTime?

  prescriptionItems PrescriptionMedication[]
  dispenseItems     DispenseItem[]
}

model Prescription {
  id              String               @id @default(uuid()) @db.Uuid
  patientId       String               @db.Uuid
  doctorId        String               @db.Uuid
  status          PrescriptionStatus   @default(DRAFT)
  issuedAt        DateTime?
  notes           String?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  deletedAt       DateTime?

  patient         PatientProfile       @relation(fields: [patientId], references: [id], onDelete: Restrict)
  doctor          DoctorProfile        @relation(fields: [doctorId], references: [id], onDelete: Restrict)
  items           PrescriptionMedication[]
  dispenseRecords DispenseRecord[]

  @@index([patientId, status])
  @@index([doctorId, status])
}

model PrescriptionMedication {
  id              String         @id @default(uuid()) @db.Uuid
  prescriptionId  String         @db.Uuid
  medicationId    String         @db.Uuid
  dosage          String
  frequency       String
  durationDays    Int?
  quantity        Int
  instructions    String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  prescription    Prescription   @relation(fields: [prescriptionId], references: [id], onDelete: Cascade)
  medication      Medication     @relation(fields: [medicationId], references: [id], onDelete: Restrict)

  @@index([prescriptionId])
  @@index([medicationId])
}

model DispenseRecord {
  id              String          @id @default(uuid()) @db.Uuid
  prescriptionId  String          @db.Uuid
  pharmacistId    String          @db.Uuid
  dispensedAt     DateTime        @default(now())
  status          DispenseStatus  @default(DISPENSED)
  notes           String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  prescription    Prescription    @relation(fields: [prescriptionId], references: [id], onDelete: Restrict)
  pharmacist      User            @relation("DispensePharmacist", fields: [pharmacistId], references: [id], onDelete: Restrict)
  items           DispenseItem[]

  @@index([prescriptionId])
  @@index([pharmacistId])
  @@index([status, dispensedAt])
}

model DispenseItem {
  id              String          @id @default(uuid()) @db.Uuid
  dispenseRecordId String         @db.Uuid
  medicationId    String          @db.Uuid
  quantity        Int
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  dispenseRecord  DispenseRecord  @relation(fields: [dispenseRecordId], references: [id], onDelete: Cascade)
  medication      Medication      @relation(fields: [medicationId], references: [id], onDelete: Restrict)

  @@unique([dispenseRecordId, medicationId])
  @@index([medicationId])
}

model ChatSession {
  id            String         @id @default(uuid()) @db.Uuid
  ownerUserId   String         @db.Uuid
  channel       ChatChannel    @default(PATIENT)
  providerKey   String
  providerSessionId String?
  providerMetadata Json?
  title         String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?

  ownerUser     User           @relation("ChatSessionOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  messages      ChatMessage[]

  @@index([ownerUserId])
  @@index([providerKey])
}

model ChatMessage {
  id              String       @id @default(uuid()) @db.Uuid
  sessionId       String       @db.Uuid
  authorUserId    String?      @db.Uuid
  actor           ChatActor
  content         String       @db.Text
  providerRequestId String?
  providerMessageId String?
  providerModel   String?
  providerStatusCode Int?
  providerLatencyMs Int?
  providerMetadata Json?
  disclaimerShown Boolean      @default(false)
  safetyTags      Json?
  createdAt       DateTime     @default(now())

  session         ChatSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorUser      User?        @relation("ChatMessageAuthor", fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([sessionId, createdAt])
  @@index([authorUserId])
  @@index([providerRequestId])
  @@index([providerMessageId])
}
```

External AI audit requirement:

- Store provider request/message identifiers and latency/status metadata for traceability.
- Keep provider credential values out of the database (store only non-secret metadata).

Prisma v7 config note:

- Keep datasource URL and migration settings in `prisma.config.ts` (project root or API workspace root).
- Run `prisma generate` explicitly after schema changes.

## 4. Soft Delete Implementation

Soft-delete policy:

- Use `deletedAt` (`DateTime?`) as the canonical soft-delete flag.
- Soft delete means `deletedAt = now()`; restore means `deletedAt = null`.
- Default all read queries to active records only (`where: { deletedAt: null }`).
- Hard delete is restricted to retention/purge jobs and never used in normal business flows.

PrismaService strategy (required):

- Centralize soft-delete behavior in `apps/api/src/common/prisma/prisma.service.ts`.
- Add reusable methods in PrismaService so repositories do not duplicate logic.
- Repositories call PrismaService helpers instead of writing ad-hoc `deletedAt` filters.
- PrismaService must instantiate Prisma Client using Prisma v7 adapter-based constructor.

Recommended PrismaService contract:

- `softDelete(model, where, actorId?)`
- `restore(model, where, actorId?)`
- `withNotDeleted(where?, includeDeleted = false)`

Example strategy in `prisma.service.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type SoftDeleteModel =
  | "user"
  | "role"
  | "userRole"
  | "patientProfile"
  | "doctorProfile"
  | "appointment"
  | "registration"
  | "medication"
  | "prescription"
  | "chatSession";

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  withNotDeleted<T extends Record<string, unknown>>(
    where?: T,
    includeDeleted = false,
  ): T | Record<string, unknown> {
    if (includeDeleted) return where ?? {};
    return { ...(where ?? {}), deletedAt: null };
  }

  async softDelete(model: SoftDeleteModel, where: Record<string, unknown>) {
    return (this[model] as any).update({
      where,
      data: { deletedAt: new Date() },
    });
  }

  async restore(model: SoftDeleteModel, where: Record<string, unknown>) {
    return (this[model] as any).update({
      where,
      data: { deletedAt: null },
    });
  }
}
```

Repository usage pattern:

```ts
return this.prisma.patientProfile.findMany({
  where: this.prisma.withNotDeleted(filters, includeDeleted),
});

await this.prisma.softDelete("patientProfile", { id });
```

Unique constraint note:

- For fields that must be reusable after soft delete (example: email/license/MRN), implement **partial unique indexes** in SQL migrations (`WHERE deleted_at IS NULL`).
- Prisma schema remains the source for model shape, while partial index DDL can be added directly in migration SQL files.

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
