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
    ('doctor.update:any', 'Doctor', 'update', 'ANY', 'Update all doctor profiles'),
    ('doctor.update:own', 'Doctor', 'update', 'OWN', 'Update own doctor profile'),
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
    ('appointment.approve:any', 'Appointment', 'approve', 'ANY', 'Approve or reject special appointment requests'),
    ('appointment.session.read:any', 'AppointmentSession', 'read', 'ANY', 'Read appointment sessions and queues'),
    ('appointment.session.update:any', 'AppointmentSession', 'update', 'ANY', 'Update appointment session capacity and status'),
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
    ('ADMIN', 'doctor.update:any'),
    ('ADMIN', 'doctor-patient.assign:any'),
    ('ADMIN', 'doctor-patient.unassign:any'),
    ('ADMIN', 'doctor-patient.activity.read:any'),
    ('ADMIN', 'doctor.schedule.write:any'),
    ('ADMIN', 'appointment.read:any'),
    ('ADMIN', 'appointment.create:any'),
    ('ADMIN', 'appointment.update:any'),
    ('ADMIN', 'appointment.cancel:any'),
    ('ADMIN', 'appointment.approve:any'),
    ('ADMIN', 'appointment.session.read:any'),
    ('ADMIN', 'appointment.session.update:any'),
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
    ('DOCTOR', 'appointment.session.read:any'),
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
    ('PATIENT', 'appointment.session.read:any'),
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

-- Development demo patients. Replace or remove this block for production seeds.
WITH seed_patients(mrn, full_name, date_of_birth, sex, status, phone_number, address) AS (
  VALUES
    ('MRN-0001', 'Budi Santoso', '1985-03-12', 'MALE', 'OUT_PATIENT', '+62-812-1000-0001', 'Jl. Merdeka No. 12, Jakarta Pusat'),
    ('MRN-0002', 'Siti Rahayu', '1992-07-28', 'FEMALE', 'OUT_PATIENT', '+62-812-1000-0002', 'Jl. Sudirman No. 45, Jakarta Selatan'),
    ('MRN-0003', 'Agus Wijaya', '1978-11-05', 'MALE', 'IN_PATIENT', '+62-812-1000-0003', 'Jl. Gatot Subroto No. 8, Bandung'),
    ('MRN-0004', 'Dewi Lestari', '2001-01-19', 'FEMALE', 'OUT_PATIENT', '+62-812-1000-0004', 'Jl. Diponegoro No. 21, Surabaya'),
    ('MRN-0005', 'Rina Kusuma', '1965-09-30', 'FEMALE', 'DISCHARGED', '+62-812-1000-0005', 'Jl. Ahmad Yani No. 3, Yogyakarta')
)
INSERT INTO "patient_profiles" (
  "id",
  "mrn",
  "full_name",
  "date_of_birth",
  "sex",
  "status",
  "phone_number",
  "address",
  "owner_user_id",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('patient:' || mrn)::uuid,
  mrn,
  full_name,
  date_of_birth::date,
  sex::"PatientSex",
  status::"PatientStatus",
  phone_number,
  address,
  NULL,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_patients
ON CONFLICT ("mrn") DO UPDATE
SET
  "full_name" = EXCLUDED."full_name",
  "date_of_birth" = EXCLUDED."date_of_birth",
  "sex" = EXCLUDED."sex",
  "status" = EXCLUDED."status",
  "phone_number" = EXCLUDED."phone_number",
  "address" = EXCLUDED."address",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Specialty catalog baseline. Safe to re-run; keeps names unique and revives soft-deleted rows.
WITH seed_specialties(name) AS (
  VALUES
    ('General Practice'),
    ('Internal Medicine'),
    ('Pediatrics'),
    ('Cardiology'),
    ('Obstetrics & Gynecology'),
    ('General Surgery'),
    ('Orthopedics'),
    ('Neurology'),
    ('Psychiatry'),
    ('Dermatology & Venereology'),
    ('Ophthalmology'),
    ('Otorhinolaryngology (ENT)'),
    ('Pulmonology'),
    ('Urology'),
    ('Anesthesiology'),
    ('Radiology'),
    ('Dentistry')
)
INSERT INTO "specialties" (
  "id",
  "name",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('specialty:' || lower(name))::uuid,
  name,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_specialties
ON CONFLICT ("name") DO UPDATE
SET
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo doctors. Replace or remove this block for production seeds.
-- NIK values are synthetic (structurally valid 16 digits, never real ones):
-- digits 7-12 encode DD/MM/YY with +40 on DD for female practitioners.
WITH seed_doctors(license_number, full_name, specialty_name, phone_number, nik) AS (
  VALUES
    ('SIP-2026-0001', 'dr. Andi Prasetyo, Sp.PD', 'Internal Medicine', '+62-811-2000-0001', '3173011001800001'),
    ('SIP-2026-0002', 'dr. Maya Sari, Sp.A', 'Pediatrics', '+62-811-2000-0002', '3173015504850002'),
    ('SIP-2026-0003', 'dr. Hendra Gunawan, Sp.JP', 'Cardiology', '+62-811-2000-0003', '3173012208780003'),
    ('SIP-2026-0004', 'dr. Fitri Handayani, Sp.OG', 'Obstetrics & Gynecology', '+62-811-2000-0004', '3173014512830004'),
    ('SIP-2026-0005', 'dr. Yusuf Hidayat', 'General Practice', '+62-811-2000-0005', '3173013006900005')
)
INSERT INTO "doctor_profiles" (
  "id",
  "license_number",
  "full_name",
  "specialty_id",
  "phone_number",
  "nik",
  "satusehat_practitioner_id",
  "owner_user_id",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor:' || license_number)::uuid,
  license_number,
  full_name,
  specialties."id",
  phone_number,
  nik,
  NULL,
  NULL,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_doctors
JOIN "specialties" AS specialties ON lower(specialties."name") = lower(specialty_name)
ON CONFLICT ("license_number") DO UPDATE
SET
  "full_name" = EXCLUDED."full_name",
  "specialty_id" = EXCLUDED."specialty_id",
  "phone_number" = EXCLUDED."phone_number",
  "nik" = EXCLUDED."nik",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo practitioner licenses (synthetic STR/SIP numbers).
-- STR entries have no expiry (lifetime under UU Kesehatan No. 17/2023);
-- SIP entries are time-limited per practice location.
WITH seed_doctor_licenses(doctor_license_number, type, license_number, issued_at, expires_at) AS (
  VALUES
    ('SIP-2026-0001', 'STR', 'STR-31-2019-000101', DATE '2019-03-01', NULL::date),
    ('SIP-2026-0001', 'SIP', 'SIP-2026-0001', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0002', 'STR', 'STR-31-2020-000202', DATE '2020-07-15', NULL::date),
    ('SIP-2026-0002', 'SIP', 'SIP-2026-0002', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0003', 'STR', 'STR-31-2017-000303', DATE '2017-11-20', NULL::date),
    ('SIP-2026-0003', 'SIP', 'SIP-2026-0003', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0004', 'STR', 'STR-31-2021-000404', DATE '2021-05-10', NULL::date),
    ('SIP-2026-0004', 'SIP', 'SIP-2026-0004', DATE '2026-01-02', DATE '2031-01-01'),
    ('SIP-2026-0005', 'STR', 'STR-31-2022-000505', DATE '2022-09-05', NULL::date),
    ('SIP-2026-0005', 'SIP', 'SIP-2026-0005', DATE '2026-01-02', DATE '2031-01-01')
)
INSERT INTO "doctor_licenses" (
  "id",
  "doctor_id",
  "type",
  "license_number",
  "issued_at",
  "expires_at",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor-license:' || type || ':' || license_number)::uuid,
  md5('doctor:' || doctor_license_number)::uuid,
  type::"DoctorLicenseType",
  license_number,
  issued_at,
  expires_at,
  NOW(),
  NOW(),
  NULL
FROM seed_doctor_licenses
ON CONFLICT ("id") DO UPDATE
SET
  "license_number" = EXCLUDED."license_number",
  "issued_at" = EXCLUDED."issued_at",
  "expires_at" = EXCLUDED."expires_at",
  "updated_at" = NOW(),
  "deleted_at" = NULL;

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
