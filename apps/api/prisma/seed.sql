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
    ('patient.read-identifier:any', 'Patient', 'read-identifier', 'ANY', 'Reveal any patient NIK and BPJS number'),
    ('patient.read-identifier:own', 'Patient', 'read-identifier', 'OWN', 'Reveal own NIK and BPJS number'),
    ('patient.import-identifier:any', 'Patient', 'import-identifier', 'ANY', 'Import patients with an existing medical record number'),
    ('doctor.read:any', 'Doctor', 'read', 'ANY', 'Read doctor profiles'),
    ('doctor.create:any', 'Doctor', 'create', 'ANY', 'Create doctor profiles'),
    ('doctor.update:any', 'Doctor', 'update', 'ANY', 'Update all doctor profiles'),
    ('doctor.update:own', 'Doctor', 'update', 'OWN', 'Update own doctor profile'),
    ('doctor.read-identifier:any', 'Doctor', 'read-identifier', 'ANY', 'Reveal any practitioner NIK'),
    ('doctor.read-identifier:own', 'Doctor', 'read-identifier', 'OWN', 'Reveal own practitioner NIK'),
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
    ('icd10-code.read:any', 'Icd10Code', 'read', 'ANY', 'Search the ICD-10 diagnosis code catalog'),
    ('icd9cm-code.read:any', 'Icd9cmCode', 'read', 'ANY', 'Search the ICD-9-CM procedure code catalog'),
    ('medication.read:any', 'Medication', 'read', 'ANY', 'Read medications'),
    ('medication.create:any', 'Medication', 'create', 'ANY', 'Create medication catalog entries'),
    ('medication.update:any', 'Medication', 'update', 'ANY', 'Update medication catalog entries'),
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
    -- Unmasking is deliberately narrow: front-desk admins verify a KTP against
    -- the record and migrate legacy folders; doctors and pharmacists work from
    -- the MRN and get neither grant.
    ('ADMIN', 'patient.read-identifier:any'),
    ('ADMIN', 'patient.import-identifier:any'),
    ('ADMIN', 'doctor.read-identifier:any'),
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
    ('ADMIN', 'icd10-code.read:any'),
    ('ADMIN', 'icd9cm-code.read:any'),
    ('ADMIN', 'medication.read:any'),
    ('ADMIN', 'medication.create:any'),
    ('ADMIN', 'medication.update:any'),
    ('ADMIN', 'prescription.read:any'),
    ('ADMIN', 'prescription.write:any'),
    ('ADMIN', 'dispense.write:any'),
    ('ADMIN', 'chat.session.create:own'),
    ('ADMIN', 'chat.message.create:own'),
    ('ADMIN', 'chat.message.read:any'),
    ('DOCTOR', 'auth.logout:own'),
    ('DOCTOR', 'patient.read:own'),
    ('DOCTOR', 'doctor.read:any'),
    ('DOCTOR', 'doctor.read-identifier:own'),
    ('DOCTOR', 'doctor.schedule.write:own'),
    ('DOCTOR', 'appointment.read:own'),
    ('DOCTOR', 'appointment.create:own'),
    ('DOCTOR', 'appointment.update:own'),
    ('DOCTOR', 'appointment.cancel:own'),
    ('DOCTOR', 'appointment.session.read:any'),
    ('DOCTOR', 'registration.read:any'),
    -- The doctor codes the diagnosis and the procedures, so both lookups are
    -- clinical tools, not admin ones. Pharmacists and patients get no grant.
    ('DOCTOR', 'icd10-code.read:any'),
    ('DOCTOR', 'icd9cm-code.read:any'),
    ('DOCTOR', 'medication.read:any'),
    ('DOCTOR', 'prescription.read:own'),
    ('DOCTOR', 'prescription.write:own'),
    ('DOCTOR', 'chat.session.create:own'),
    ('DOCTOR', 'chat.message.create:own'),
    ('DOCTOR', 'chat.message.read:own'),
    ('PHARMACIST', 'auth.logout:own'),
    ('PHARMACIST', 'medication.read:any'),
    ('PHARMACIST', 'medication.create:any'),
    ('PHARMACIST', 'medication.update:any'),
    ('PHARMACIST', 'prescription.read:any'),
    ('PHARMACIST', 'dispense.write:any'),
    ('PATIENT', 'auth.logout:own'),
    ('PATIENT', 'patient.read:own'),
    ('PATIENT', 'patient.update:own'),
    ('PATIENT', 'patient.read-identifier:own'),
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
-- These MRNs keep their legacy `MRN-000n` shape deliberately: row ids are
-- derived from the MRN (`md5('patient:' || mrn)`), so renaming them would add a
-- second set of demo patients to every existing dev database rather than
-- updating the current one. They stand in for the legacy-import case; numbers
-- the server allocates look like `00000006`.
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

-- Keep the MRN counter ahead of every seeded record. Without this the first
-- API-created patient would be handed a number the seed already used, and the
-- unique constraint would reject an otherwise valid registration. Idempotent
-- and monotonic: re-running the seed never moves the counter backwards.
INSERT INTO "mrn_counters" ("facility_id", "next_value", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 1, NOW())
ON CONFLICT ("facility_id") DO NOTHING;

UPDATE "mrn_counters"
SET
  "next_value" = GREATEST(
    "next_value",
    COALESCE(
      (
        SELECT MAX("digits"::bigint)
        FROM (
          SELECT regexp_replace("mrn", '\D', '', 'g') AS "digits"
          FROM "patient_profiles"
        ) AS "extracted"
        WHERE "digits" <> '' AND length("digits") <= 18
      ),
      0
    ) + 1
  ),
  "updated_at" = NOW()
WHERE "facility_id" = '00000000-0000-0000-0000-000000000000'::uuid;

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

-- ICD-10 starter catalog.
--
-- NOT the official list. This is a small set of high-frequency FKTP primary-care
-- diagnoses so that development, demos, and the /icd10-codes lookup work out of
-- the box. Before go-live, load the official Kemenkes list with
-- `pnpm --filter @hms/api icd10:import <file.csv>` — it upserts by code and
-- deactivates anything absent from the file, so it converges this baseline onto
-- the official catalog without orphaning historic diagnoses.
--
-- The Indonesian titles below are working translations for search and display,
-- not official Kemenkes wording; the import overwrites them.
--
-- `category` is the three-character parent code and `chapter` is derived from
-- it. The importer applies the identical mapping in TypeScript
-- (deriveIcd10Chapter in @hms/shared-types) — keep the two in step.
WITH seed_icd10_codes(code, display, display_indonesian) AS (
  VALUES
    ('A01.0', 'Typhoid fever', 'Demam tifoid'),
    ('A09', 'Diarrhoea and gastroenteritis of presumed infectious origin', 'Diare dan gastroenteritis diduga infeksi'),
    ('A15.0', 'Tuberculosis of lung, confirmed by sputum microscopy with or without culture', 'Tuberkulosis paru, terkonfirmasi mikroskopis sputum'),
    ('A90', 'Dengue fever [classical dengue]', 'Demam dengue'),
    ('A91', 'Dengue haemorrhagic fever', 'Demam berdarah dengue'),
    ('B34.9', 'Viral infection, unspecified', 'Infeksi virus, tidak dijelaskan'),
    ('B35.4', 'Tinea corporis', 'Tinea korporis'),
    ('B86', 'Scabies', 'Skabies'),
    ('D50.9', 'Iron deficiency anaemia, unspecified', 'Anemia defisiensi besi, tidak dijelaskan'),
    ('E11.9', 'Type 2 diabetes mellitus without complications', 'Diabetes melitus tipe 2 tanpa komplikasi'),
    ('E66.9', 'Obesity, unspecified', 'Obesitas, tidak dijelaskan'),
    ('E78.5', 'Hyperlipidaemia, unspecified', 'Hiperlipidemia, tidak dijelaskan'),
    ('E86', 'Volume depletion', 'Deplesi volume (dehidrasi)'),
    ('G43.9', 'Migraine, unspecified', 'Migren, tidak dijelaskan'),
    ('G44.2', 'Tension-type headache', 'Nyeri kepala tipe tegang'),
    ('H10.9', 'Conjunctivitis, unspecified', 'Konjungtivitis, tidak dijelaskan'),
    ('H60.9', 'Otitis externa, unspecified', 'Otitis eksterna, tidak dijelaskan'),
    ('H66.9', 'Otitis media, unspecified', 'Otitis media, tidak dijelaskan'),
    ('I10', 'Essential (primary) hypertension', 'Hipertensi esensial (primer)'),
    ('I11.9', 'Hypertensive heart disease without (congestive) heart failure', 'Penyakit jantung hipertensi tanpa gagal jantung'),
    ('J00', 'Acute nasopharyngitis [common cold]', 'Nasofaringitis akut (selesma)'),
    ('J01.9', 'Acute sinusitis, unspecified', 'Sinusitis akut, tidak dijelaskan'),
    ('J02.9', 'Acute pharyngitis, unspecified', 'Faringitis akut, tidak dijelaskan'),
    ('J03.9', 'Acute tonsillitis, unspecified', 'Tonsilitis akut, tidak dijelaskan'),
    ('J06.9', 'Acute upper respiratory infection, unspecified', 'Infeksi saluran napas atas akut, tidak dijelaskan'),
    ('J18.9', 'Pneumonia, unspecified', 'Pneumonia, tidak dijelaskan'),
    ('J20.9', 'Acute bronchitis, unspecified', 'Bronkitis akut, tidak dijelaskan'),
    ('J30.4', 'Allergic rhinitis, unspecified', 'Rinitis alergi, tidak dijelaskan'),
    ('J31.0', 'Chronic rhinitis', 'Rinitis kronik'),
    ('J44.9', 'Chronic obstructive pulmonary disease, unspecified', 'Penyakit paru obstruktif kronik, tidak dijelaskan'),
    ('J45.9', 'Asthma, unspecified', 'Asma, tidak dijelaskan'),
    ('K02.9', 'Dental caries, unspecified', 'Karies gigi, tidak dijelaskan'),
    ('K21.9', 'Gastro-oesophageal reflux disease without oesophagitis', 'Penyakit refluks gastroesofageal tanpa esofagitis'),
    ('K29.7', 'Gastritis, unspecified', 'Gastritis, tidak dijelaskan'),
    ('K30', 'Dyspepsia', 'Dispepsia'),
    ('K59.0', 'Constipation', 'Konstipasi'),
    ('L02.9', 'Cutaneous abscess, furuncle and carbuncle, unspecified', 'Abses kulit, furunkel dan karbunkel, tidak dijelaskan'),
    ('L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis atopik, tidak dijelaskan'),
    ('L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis kontak alergi, penyebab tidak dijelaskan'),
    ('L30.9', 'Dermatitis, unspecified', 'Dermatitis, tidak dijelaskan'),
    ('L50.9', 'Urticaria, unspecified', 'Urtikaria, tidak dijelaskan'),
    ('M06.9', 'Rheumatoid arthritis, unspecified', 'Artritis reumatoid, tidak dijelaskan'),
    ('M10.9', 'Gout, unspecified', 'Gout, tidak dijelaskan'),
    ('M13.9', 'Arthritis, unspecified', 'Artritis, tidak dijelaskan'),
    ('M54.2', 'Cervicalgia', 'Servikalgia (nyeri leher)'),
    ('M54.5', 'Low back pain', 'Nyeri punggung bawah'),
    ('M79.1', 'Myalgia', 'Mialgia'),
    ('N30.0', 'Acute cystitis', 'Sistitis akut'),
    ('N39.0', 'Urinary tract infection, site not specified', 'Infeksi saluran kemih, lokasi tidak dijelaskan'),
    ('N76.0', 'Acute vaginitis', 'Vaginitis akut'),
    ('R05', 'Cough', 'Batuk'),
    ('R10.4', 'Other and unspecified abdominal pain', 'Nyeri perut lain dan tidak dijelaskan'),
    ('R11', 'Nausea and vomiting', 'Mual dan muntah'),
    ('R42', 'Dizziness and giddiness', 'Pusing berputar'),
    ('R50.9', 'Fever, unspecified', 'Demam, tidak dijelaskan'),
    ('R51', 'Headache', 'Nyeri kepala'),
    ('Z00.0', 'General medical examination', 'Pemeriksaan kesehatan umum'),
    ('Z34.9', 'Supervision of normal pregnancy, unspecified', 'Pengawasan kehamilan normal, tidak dijelaskan')
),
seed_icd10_codes_with_category AS (
  SELECT
    code,
    display,
    display_indonesian,
    split_part(code, '.', 1) AS category
  FROM seed_icd10_codes
)
INSERT INTO "icd10_codes" (
  "id",
  "code",
  "display",
  "display_indonesian",
  "category",
  "chapter",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('icd10:' || code)::uuid,
  code,
  display,
  display_indonesian,
  category,
  CASE
    WHEN category BETWEEN 'A00' AND 'B99' THEN 'I'
    WHEN category BETWEEN 'C00' AND 'D48' THEN 'II'
    WHEN category BETWEEN 'D50' AND 'D89' THEN 'III'
    WHEN category BETWEEN 'E00' AND 'E90' THEN 'IV'
    WHEN category BETWEEN 'F00' AND 'F99' THEN 'V'
    WHEN category BETWEEN 'G00' AND 'G99' THEN 'VI'
    WHEN category BETWEEN 'H00' AND 'H59' THEN 'VII'
    WHEN category BETWEEN 'H60' AND 'H95' THEN 'VIII'
    WHEN category BETWEEN 'I00' AND 'I99' THEN 'IX'
    WHEN category BETWEEN 'J00' AND 'J99' THEN 'X'
    WHEN category BETWEEN 'K00' AND 'K93' THEN 'XI'
    WHEN category BETWEEN 'L00' AND 'L99' THEN 'XII'
    WHEN category BETWEEN 'M00' AND 'M99' THEN 'XIII'
    WHEN category BETWEEN 'N00' AND 'N99' THEN 'XIV'
    WHEN category BETWEEN 'O00' AND 'O99' THEN 'XV'
    WHEN category BETWEEN 'P00' AND 'P96' THEN 'XVI'
    WHEN category BETWEEN 'Q00' AND 'Q99' THEN 'XVII'
    WHEN category BETWEEN 'R00' AND 'R99' THEN 'XVIII'
    WHEN category BETWEEN 'S00' AND 'T98' THEN 'XIX'
    WHEN category BETWEEN 'V01' AND 'Y98' THEN 'XX'
    WHEN category BETWEEN 'Z00' AND 'Z99' THEN 'XXI'
    ELSE NULL
  END,
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_icd10_codes_with_category
ON CONFLICT ("code") DO UPDATE
SET
  "display" = EXCLUDED."display",
  "display_indonesian" = EXCLUDED."display_indonesian",
  "category" = EXCLUDED."category",
  "chapter" = EXCLUDED."chapter",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- ICD-9-CM procedure starter catalog.
--
-- NOT the official list, and deliberately smaller than the ICD-10 starter set:
-- it covers only procedures routinely performed in an Indonesian FKTP, so that
-- the /icd9cm-codes lookup is usable in development and demos. Load the official
-- list with `pnpm --filter @hms/api icd9cm:import <file.csv>` before go-live —
-- BPJS prices a claim from these codes, so an approximate catalog is a billing
-- problem, not just a display one.
--
-- Indonesian titles are working translations, overwritten by the import.
-- `category` is the two-digit parent code. There is no chapter column: ICD-9-CM
-- procedure chapters do not map to a clean lexicographic range the way ICD-10
-- chapters do.
WITH seed_icd9cm_codes(code, display, display_indonesian) AS (
  VALUES
    ('57.94', 'Insertion of indwelling urinary catheter', 'Pemasangan kateter urin menetap'),
    ('86.04', 'Other incision with drainage of skin and subcutaneous tissue', 'Insisi dan drainase abses kulit'),
    ('86.22', 'Excisional debridement of wound, infection or burn', 'Debridemen eksisional luka, infeksi atau luka bakar'),
    ('86.28', 'Nonexcisional debridement of wound, infection or burn', 'Debridemen non-eksisional luka, infeksi atau luka bakar'),
    ('86.59', 'Closure of skin and subcutaneous tissue of other sites', 'Penjahitan luka kulit dan jaringan bawah kulit'),
    ('87.44', 'Routine chest x-ray', 'Rontgen dada rutin'),
    ('89.52', 'Electrocardiogram', 'Elektrokardiogram (EKG)'),
    ('89.7', 'General physical examination', 'Pemeriksaan fisik umum'),
    ('90.59', 'Other microscopic examination of blood', 'Pemeriksaan mikroskopis darah lainnya'),
    ('93.57', 'Application of other wound dressing', 'Perawatan dan penggantian balutan luka'),
    ('93.94', 'Respiratory medication administered by nebulizer', 'Pemberian obat pernapasan melalui nebulizer'),
    ('96.54', 'Dental scaling, polishing and debridement', 'Pembersihan karang gigi dan pemolesan'),
    ('96.59', 'Other irrigation of wound', 'Irigasi luka lainnya'),
    ('99.21', 'Injection of antibiotic', 'Injeksi antibiotik'),
    ('99.23', 'Injection of steroid', 'Injeksi steroid'),
    ('99.29', 'Injection or infusion of other therapeutic or prophylactic substance', 'Injeksi atau infus zat terapeutik atau profilaksis lainnya'),
    ('99.59', 'Other vaccination and inoculation', 'Vaksinasi dan inokulasi lainnya')
)
INSERT INTO "icd9cm_codes" (
  "id",
  "code",
  "display",
  "display_indonesian",
  "category",
  "is_active",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('icd9cm:' || code)::uuid,
  code,
  display,
  display_indonesian,
  split_part(code, '.', 1),
  true,
  NOW(),
  NOW(),
  NULL
FROM seed_icd9cm_codes
ON CONFLICT ("code") DO UPDATE
SET
  "display" = EXCLUDED."display",
  "display_indonesian" = EXCLUDED."display_indonesian",
  "category" = EXCLUDED."category",
  "is_active" = true,
  "updated_at" = NOW(),
  "deleted_at" = NULL;

-- Development demo doctors. Replace or remove this block for production seeds.
-- Practitioner NIK is deliberately absent: it is encrypted at rest
-- (nik_ciphertext / nik_index / nik_last4 / nik_key_version) by
-- NationalIdentifierCryptoService, so plain SQL cannot produce valid columns.
-- Set doctor NIKs through the API, or via `pnpm --filter @hms/api backfill:doctor-nik`.
WITH seed_doctors(
  license_number,
  full_name,
  specialty_name,
  phone_number,
  email,
  title,
  degrees
) AS (
  VALUES
    ('SIP-2026-0001', 'dr. Andi Prasetyo, Sp.PD', 'Internal Medicine', '+62-811-2000-0001', 'andi.prasetyo@clinic.local', 'dr.', 'Sp.PD'),
    ('SIP-2026-0002', 'dr. Maya Sari, Sp.A', 'Pediatrics', '+62-811-2000-0002', 'maya.sari@clinic.local', 'dr.', 'Sp.A'),
    ('SIP-2026-0003', 'dr. Hendra Gunawan, Sp.JP', 'Cardiology', '+62-811-2000-0003', 'hendra.gunawan@clinic.local', 'dr.', 'Sp.JP'),
    ('SIP-2026-0004', 'dr. Fitri Handayani, Sp.OG', 'Obstetrics & Gynecology', '+62-811-2000-0004', 'fitri.handayani@clinic.local', 'dr.', 'Sp.OG'),
    ('SIP-2026-0005', 'dr. Yusuf Hidayat', 'General Practice', '+62-811-2000-0005', 'yusuf.hidayat@clinic.local', 'dr.', NULL)
)
INSERT INTO "doctor_profiles" (
  "id",
  "license_number",
  "full_name",
  "specialty_id",
  "phone_number",
  "email",
  "title",
  "degrees",
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
  email,
  title,
  degrees,
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
  "email" = EXCLUDED."email",
  "title" = EXCLUDED."title",
  "degrees" = EXCLUDED."degrees",
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

-- Development demo doctor education rows (synthetic institutions/years).
WITH seed_doctor_educations(
  doctor_license_number,
  institution,
  degree,
  field_of_study,
  graduation_year
) AS (
  VALUES
    ('SIP-2026-0001', 'Universitas Indonesia', 'dr.', 'Kedokteran', 2004),
    ('SIP-2026-0001', 'Universitas Indonesia', 'Sp.PD', 'Penyakit Dalam', 2010),
    ('SIP-2026-0002', 'Universitas Gadjah Mada', 'dr.', 'Kedokteran', 2008),
    ('SIP-2026-0002', 'Universitas Gadjah Mada', 'Sp.A', 'Ilmu Kesehatan Anak', 2014),
    ('SIP-2026-0003', 'Universitas Airlangga', 'dr.', 'Kedokteran', 2002),
    ('SIP-2026-0003', 'Universitas Airlangga', 'Sp.JP', 'Jantung dan Pembuluh Darah', 2009),
    ('SIP-2026-0004', 'Universitas Padjadjaran', 'dr.', 'Kedokteran', 2006),
    ('SIP-2026-0004', 'Universitas Padjadjaran', 'Sp.OG', 'Obstetri dan Ginekologi', 2012),
    ('SIP-2026-0005', 'Universitas Sumatera Utara', 'dr.', 'Kedokteran', 2015)
)
INSERT INTO "doctor_educations" (
  "id",
  "doctor_id",
  "institution",
  "degree",
  "field_of_study",
  "graduation_year",
  "created_at",
  "updated_at",
  "deleted_at"
)
SELECT
  md5('doctor-education:' || doctor_license_number || ':' || degree || ':' || COALESCE(field_of_study, '') || ':' || COALESCE(graduation_year::text, ''))::uuid,
  md5('doctor:' || doctor_license_number)::uuid,
  institution,
  degree,
  field_of_study,
  graduation_year,
  NOW(),
  NOW(),
  NULL
FROM seed_doctor_educations
ON CONFLICT ("id") DO UPDATE
SET
  "institution" = EXCLUDED."institution",
  "degree" = EXCLUDED."degree",
  "field_of_study" = EXCLUDED."field_of_study",
  "graduation_year" = EXCLUDED."graduation_year",
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
