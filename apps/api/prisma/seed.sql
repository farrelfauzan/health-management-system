BEGIN;

WITH seed_roles(code, name, description) AS (
  VALUES
    ('SUPER_ADMIN', 'Super Admin', 'System-level administrator with full access'),
    ('ADMIN', 'Admin', 'Operational administrator for HMS modules'),
    ('DOCTOR', 'Doctor', 'Clinical user with doctor-scoped access'),
    ('PHARMACIST', 'Pharmacist', 'Pharmacy workflow operator'),
    ('PATIENT', 'Patient', 'Patient self-service access role')
)
INSERT INTO "roles" (
  "id",
  "code",
  "name",
  "description",
  "is_system",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('role:' || code)::uuid,
  code,
  name,
  description,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_roles
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system" = EXCLUDED."is_system",
  "updated_at" = NOW(),
  "deleted_at" = NULL;

WITH seed_permissions(permission_key, resource, action, scope, description) AS (
  VALUES
    ('role.assign:any', 'Role', 'assign', 'ANY', 'Assign roles to users'),
    ('role.read:any', 'Role', 'read', 'ANY', 'Read role catalog'),
    ('role.unassign:any', 'Role', 'unassign', 'ANY', 'Unassign roles from users'),
    ('auth.logout:own', 'Auth', 'logout', 'OWN', 'Logout own session'),
    ('user.read:any', 'User', 'read', 'ANY', 'Read all users'),
    ('user.create:any', 'User', 'create', 'ANY', 'Create users'),
    ('user.update:any', 'User', 'update', 'ANY', 'Update users'),
    ('patient.read:any', 'Patient', 'read', 'ANY', 'Read all patients'),
    ('patient.read:own', 'Patient', 'read', 'OWN', 'Read own patient profile'),
    ('patient.create:any', 'Patient', 'create', 'ANY', 'Create patients'),
    ('patient.update:any', 'Patient', 'update', 'ANY', 'Update all patients'),
    ('patient.update:own', 'Patient', 'update', 'OWN', 'Update own patient profile'),
    ('doctor.read:any', 'Doctor', 'read', 'ANY', 'Read doctor profiles'),
    ('doctor.create:any', 'Doctor', 'create', 'ANY', 'Create doctor profiles'),
    ('doctor-patient.assign:any', 'DoctorPatient', 'assign', 'ANY', 'Assign doctors to patients'),
    ('doctor-patient.unassign:any', 'DoctorPatient', 'unassign', 'ANY', 'Unassign doctor-patient assignments'),
    ('doctor-patient.activity.read:any', 'DoctorPatientActivity', 'read', 'ANY', 'Read doctor-patient assignment activity log'),
    ('doctor.schedule.write:any', 'DoctorSchedule', 'write', 'ANY', 'Manage all doctor schedules'),
    ('doctor.schedule.write:own', 'DoctorSchedule', 'write', 'OWN', 'Manage own doctor schedule'),
    ('appointment.read:any', 'Appointment', 'read', 'ANY', 'Read all appointments'),
    ('appointment.read:own', 'Appointment', 'read', 'OWN', 'Read own appointments'),
    ('appointment.create:any', 'Appointment', 'create', 'ANY', 'Create appointments for any patient'),
    ('appointment.create:own', 'Appointment', 'create', 'OWN', 'Create own appointments'),
    ('appointment.update:any', 'Appointment', 'update', 'ANY', 'Update all appointments'),
    ('appointment.update:own', 'Appointment', 'update', 'OWN', 'Update own appointments'),
    ('appointment.cancel:any', 'Appointment', 'cancel', 'ANY', 'Cancel all appointments'),
    ('appointment.cancel:own', 'Appointment', 'cancel', 'OWN', 'Cancel own appointments'),
    ('registration.read:any', 'Registration', 'read', 'ANY', 'Read all registrations'),
    ('registration.read:own', 'Registration', 'read', 'OWN', 'Read own registrations'),
    ('registration.create:any', 'Registration', 'create', 'ANY', 'Create registrations for any patient'),
    ('registration.create:own', 'Registration', 'create', 'OWN', 'Create own registrations'),
    ('registration.update:any', 'Registration', 'update', 'ANY', 'Update all registrations'),
    ('registration.update:own', 'Registration', 'update', 'OWN', 'Update own registrations'),
    ('medication.read:any', 'Medication', 'read', 'ANY', 'Read medications'),
    ('prescription.read:any', 'Prescription', 'read', 'ANY', 'Read all prescriptions'),
    ('prescription.read:own', 'Prescription', 'read', 'OWN', 'Read own prescriptions'),
    ('prescription.write:any', 'Prescription', 'write', 'ANY', 'Write prescriptions for any patient'),
    ('prescription.write:own', 'Prescription', 'write', 'OWN', 'Write prescriptions for owned patients'),
    ('dispense.write:any', 'DispenseRecord', 'write', 'ANY', 'Dispense medication records'),
    ('chat.session.create:own', 'ChatSession', 'create', 'OWN', 'Create own chat sessions'),
    ('chat.message.create:own', 'ChatMessage', 'create', 'OWN', 'Create own chat messages'),
    ('chat.message.read:any', 'ChatMessage', 'read', 'ANY', 'Read all chat messages'),
    ('chat.message.read:own', 'ChatMessage', 'read', 'OWN', 'Read own chat messages')
)
INSERT INTO "permissions" (
  "id",
  "permission_key",
  "resource",
  "action",
  "scope",
  "description",
  "created_at",
  "updated_at"
)
SELECT
  md5('permission:' || permission_key)::uuid,
  permission_key,
  resource,
  action,
  scope::"PermissionScope",
  description,
  NOW(),
  NOW()
FROM seed_permissions
ON CONFLICT ("permission_key") DO UPDATE
SET
  "resource" = EXCLUDED."resource",
  "action" = EXCLUDED."action",
  "scope" = EXCLUDED."scope",
  "description" = EXCLUDED."description",
  "updated_at" = NOW();

WITH explicit_role_permissions(role_code, permission_key) AS (
  VALUES
    ('ADMIN', 'role.assign:any'),
    ('ADMIN', 'role.read:any'),
    ('ADMIN', 'role.unassign:any'),
    ('ADMIN', 'auth.logout:own'),
    ('ADMIN', 'user.read:any'),
    ('ADMIN', 'user.create:any'),
    ('ADMIN', 'user.update:any'),
    ('ADMIN', 'patient.read:any'),
    ('ADMIN', 'patient.create:any'),
    ('ADMIN', 'patient.update:any'),
    ('ADMIN', 'doctor.read:any'),
    ('ADMIN', 'doctor.create:any'),
    ('ADMIN', 'doctor-patient.assign:any'),
    ('ADMIN', 'doctor-patient.unassign:any'),
    ('ADMIN', 'doctor-patient.activity.read:any'),
    ('ADMIN', 'doctor.schedule.write:any'),
    ('ADMIN', 'appointment.read:any'),
    ('ADMIN', 'appointment.create:any'),
    ('ADMIN', 'appointment.update:any'),
    ('ADMIN', 'appointment.cancel:any'),
    ('ADMIN', 'registration.read:any'),
    ('ADMIN', 'registration.create:any'),
    ('ADMIN', 'registration.update:any'),
    ('ADMIN', 'medication.read:any'),
    ('ADMIN', 'prescription.read:any'),
    ('ADMIN', 'prescription.write:any'),
    ('ADMIN', 'dispense.write:any'),
    ('ADMIN', 'chat.session.create:own'),
    ('ADMIN', 'chat.message.create:own'),
    ('ADMIN', 'chat.message.read:any'),
    ('DOCTOR', 'auth.logout:own'),
    ('DOCTOR', 'patient.read:own'),
    ('DOCTOR', 'doctor.read:any'),
    ('DOCTOR', 'doctor.schedule.write:own'),
    ('DOCTOR', 'appointment.read:own'),
    ('DOCTOR', 'appointment.create:own'),
    ('DOCTOR', 'appointment.update:own'),
    ('DOCTOR', 'appointment.cancel:own'),
    ('DOCTOR', 'registration.read:any'),
    ('DOCTOR', 'medication.read:any'),
    ('DOCTOR', 'prescription.read:own'),
    ('DOCTOR', 'prescription.write:own'),
    ('DOCTOR', 'chat.session.create:own'),
    ('DOCTOR', 'chat.message.create:own'),
    ('DOCTOR', 'chat.message.read:own'),
    ('PHARMACIST', 'auth.logout:own'),
    ('PHARMACIST', 'medication.read:any'),
    ('PHARMACIST', 'prescription.read:any'),
    ('PHARMACIST', 'dispense.write:any'),
    ('PATIENT', 'auth.logout:own'),
    ('PATIENT', 'patient.read:own'),
    ('PATIENT', 'patient.update:own'),
    ('PATIENT', 'doctor.read:any'),
    ('PATIENT', 'appointment.read:own'),
    ('PATIENT', 'appointment.create:own'),
    ('PATIENT', 'appointment.update:own'),
    ('PATIENT', 'appointment.cancel:own'),
    ('PATIENT', 'registration.read:own'),
    ('PATIENT', 'registration.create:own'),
    ('PATIENT', 'registration.update:own'),
    ('PATIENT', 'prescription.read:own'),
    ('PATIENT', 'chat.session.create:own'),
    ('PATIENT', 'chat.message.create:own'),
    ('PATIENT', 'chat.message.read:own')
),
combined_role_permissions AS (
  SELECT 'SUPER_ADMIN'::text AS role_code, p."permission_key"
  FROM "permissions" p
  UNION
  SELECT role_code, permission_key
  FROM explicit_role_permissions
)
INSERT INTO "role_permissions" (
  "id",
  "role_id",
  "permission_id",
  "created_at"
)
SELECT
  md5('role_permission:' || crp.role_code || ':' || crp.permission_key)::uuid,
  r."id",
  p."id",
  NOW()
FROM combined_role_permissions crp
JOIN "roles" r ON r."code" = crp.role_code
JOIN "permissions" p ON p."permission_key" = crp.permission_key
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" = 'DOCTOR'
  AND p."permission_key" = 'patient.read:any';

-- Development admin account. Credentials: admin@salingjaga.com / Admin123!
-- The hash is bcryptjs (cost 10). Replace or remove this block for production seeds.
WITH seed_users(email, password_hash) AS (
  VALUES
    ('admin@salingjaga.com', '$2b$10$8Xw5CHvVbJa465ypeir1ZeRyastav5gmh/cU3ztImenBGuftYUQ1O')
)
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user:' || email)::uuid,
  email,
  password_hash,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_users
ON CONFLICT ("email") DO UPDATE
SET
  "password_hash" = EXCLUDED."password_hash",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

WITH seed_user_roles(email, role_code) AS (
  VALUES
    ('admin@salingjaga.com', 'SUPER_ADMIN')
)
INSERT INTO "user_roles" (
  "id",
  "user_id",
  "role_id",
  "assigned_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('user_role:' || sur.email || ':' || sur.role_code)::uuid,
  u."id",
  r."id",
  NOW(),
  NOW(),
  NOW(),
  NULL
FROM seed_user_roles sur
JOIN "users" u ON u."email" = sur.email
JOIN "roles" r ON r."code" = sur.role_code
ON CONFLICT ("user_id", "role_id") DO UPDATE
SET
  "unassigned_at" = NULL,
  "unassigned_by_id" = NULL,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

COMMIT;
