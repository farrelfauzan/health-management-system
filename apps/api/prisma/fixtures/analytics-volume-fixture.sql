-- P29-T03. Twelve months of clinic activity for timing the analytics queries.
--
-- THROWAWAY DATABASES ONLY. Run it through `pnpm analytics:benchmark --seed`,
-- which refuses any database whose name does not contain `analytics_perf`;
-- never against the shared dev database or a clinic's.
--
-- Expects an empty database after `prisma migrate deploy` and `seed.sql`
-- (roles, specialties). Volumes, 1 October 2025 to 30 September 2026 in
-- Asia/Jakarta:
--   4 poli, 8 clinicians, 15 000 patients
--   ~47 000 appointments (~40 000 kept, ~7 000 no-show or cancelled), 52 000 registrations (50 000 visits + 2 000 cancelled)
--   50 000 encounters with ~65 000 diagnoses, 35 000 prescriptions
--   60 000 invoices with 120 000 lines and ~56 000 payments (one per paid
--   invoice, the schema's rule), 8 000 lab orders
--   a payer on every visit: BPJS where a KUNJUNGAN was sent, else mostly general
--   50 000 SATUSEHAT and 20 000 BPJS submissions
-- Deterministic: `setseed` fixes every random() below, so a re-run on a fresh
-- database produces the same rows and the same plans.

SELECT setseed(0.29);

CREATE TEMP TABLE fixture_poli AS
SELECT id AS specialty_id, row_number() OVER (ORDER BY name) AS poli_no
FROM specialties
WHERE name IN ('General Practice', 'Dentistry', 'Pediatrics', 'Kebidanan');

INSERT INTO users (id, email, password_hash, updated_at)
VALUES ('a0000000-0000-4000-8000-000000000001', 'analytics-perf-cashier@example.test', 'x', now());

CREATE TEMP TABLE fixture_doctor AS
SELECT
  ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid AS doctor_id,
  n AS doctor_no,
  p.specialty_id
FROM generate_series(1, 8) AS n
JOIN fixture_poli p ON p.poli_no = ((n - 1) / 2) + 1;

INSERT INTO doctor_profiles (id, license_number, full_name, specialty_id, updated_at)
SELECT doctor_id, 'PERF-' || doctor_no, 'Perf Clinician ' || doctor_no, specialty_id, now()
FROM fixture_doctor;

INSERT INTO patient_profiles (id, mrn, full_name, date_of_birth, phone_number, address, sex, updated_at)
SELECT
  ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'PERF-' || lpad(n::text, 6, '0'),
  'Perf Patient ' || n,
  date '1950-01-01' + (random() * 25000)::int,
  '0800000' || lpad(n::text, 6, '0'),
  'Fixture address',
  CASE WHEN random() < 0.55 THEN 'FEMALE'::"PatientSex" ELSE 'MALE'::"PatientSex" END,
  now()
FROM generate_series(1, 15000) AS n;

-- One row per visit-to-be. Local clinic time between 07:00 and 20:59, skewed
-- towards the morning like a real front desk; patients skewed so a minority
-- come back often.
CREATE TEMP TABLE fixture_visit AS
SELECT
  n AS visit_no,
  gen_random_uuid() AS registration_id,
  gen_random_uuid() AS encounter_id,
  gen_random_uuid() AS appointment_id,
  ('b0000000-0000-4000-8000-' || lpad((1 + floor(power(random(), 1.8) * 15000))::int::text, 12, '0'))::uuid AS patient_id,
  (1 + floor(random() * 8))::int AS doctor_no,
  (
    (timestamp '2025-10-01 07:00' + (floor(random() * 365) || ' days')::interval
      + ((floor(power(random(), 1.4) * 14 * 60)) || ' minutes')::interval)
    AT TIME ZONE 'Asia/Jakarta'
  ) AT TIME ZONE 'UTC' AS registered_at,
  random() AS roll_type,
  random() AS roll_status,
  random() AS roll_booking,
  random() AS roll_channel,
  random() AS roll_extra
FROM generate_series(1, 52000) AS n;

ALTER TABLE fixture_visit ADD COLUMN doctor_id uuid, ADD COLUMN specialty_id uuid;
UPDATE fixture_visit v
SET doctor_id = d.doctor_id, specialty_id = d.specialty_id
FROM fixture_doctor d
WHERE d.doctor_no = v.doctor_no;

-- About 80% of visits were booked. Bookings that never became a visit (no-shows,
-- cancellations) are added separately below.
INSERT INTO appointments (
  id, patient_id, doctor_id, type, booking_source, bpjs_booking_code,
  scheduled_at, status, created_at, updated_at
)
SELECT
  appointment_id,
  patient_id,
  doctor_id,
  'SESSION'::"AppointmentType",
  CASE
    WHEN roll_channel < 0.20 THEN 'WHATSAPP'::channel_kind
    WHEN roll_channel < 0.25 THEN 'TELEGRAM'::channel_kind
    ELSE NULL
  END,
  CASE WHEN roll_channel >= 0.25 AND roll_channel < 0.40 THEN 'JKN' || visit_no ELSE NULL END,
  registered_at,
  'COMPLETED'::"AppointmentStatus",
  registered_at - interval '2 days',
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000 AND roll_booking < 0.80;

-- ~7 000 bookings that never became a visit: no-shows, cancellations and a
-- few still scheduled.
INSERT INTO appointments (
  id, patient_id, doctor_id, type, booking_source, bpjs_booking_code,
  scheduled_at, status, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  ('b0000000-0000-4000-8000-' || lpad((1 + floor(random() * 15000))::int::text, 12, '0'))::uuid,
  ('d0000000-0000-4000-8000-' || lpad((1 + floor(random() * 8))::int::text, 12, '0'))::uuid,
  'SESSION'::"AppointmentType",
  CASE WHEN r < 0.30 THEN 'WHATSAPP'::channel_kind WHEN r < 0.36 THEN 'TELEGRAM'::channel_kind ELSE NULL END,
  CASE WHEN r >= 0.36 AND r < 0.55 THEN 'JKN-Y' || n ELSE NULL END,
  (
    (timestamp '2025-10-01 08:00' + (floor(random() * 365) || ' days')::interval
      + (floor(random() * 10 * 60) || ' minutes')::interval)
    AT TIME ZONE 'Asia/Jakarta'
  ) AT TIME ZONE 'UTC',
  CASE
    WHEN random() < 0.50 THEN 'NO_SHOW'::"AppointmentStatus"
    WHEN random() < 0.85 THEN 'CANCELLED'::"AppointmentStatus"
    ELSE 'SCHEDULED'::"AppointmentStatus"
  END,
  now(),
  now()
FROM (SELECT n, random() AS r FROM generate_series(1, 7000) AS n) AS extra;

-- 50 000 visits (CHECKED_IN or COMPLETED) and 2 000 cancelled registrations.
INSERT INTO registrations (
  id, patient_id, appointment_id, type, status, specialty_id, poli_queue_number,
  registered_at, checked_in_at, completed_at, created_at, updated_at
)
SELECT
  registration_id,
  patient_id,
  CASE WHEN visit_no <= 50000 AND roll_booking < 0.80 THEN appointment_id ELSE NULL END,
  CASE
    WHEN roll_type < 0.90 THEN 'CONSULTATION'::registration_type
    WHEN roll_type < 0.98 THEN 'LAB_ONLY'::registration_type
    ELSE 'ADMISSION'::registration_type
  END,
  CASE
    WHEN visit_no > 50000 THEN 'CANCELLED'::"RegistrationStatus"
    WHEN roll_status < 0.02 THEN 'CHECKED_IN'::"RegistrationStatus"
    ELSE 'COMPLETED'::"RegistrationStatus"
  END,
  specialty_id,
  -- The poli queue number pairs with the poli (check constraint); unique
  -- per row here because `queue_date` is left null.
  visit_no,
  registered_at,
  CASE WHEN visit_no <= 50000 THEN registered_at + (floor(random() * 20) || ' minutes')::interval END,
  CASE WHEN visit_no <= 50000 AND roll_status >= 0.02 THEN registered_at + interval '90 minutes' END,
  registered_at,
  registered_at
FROM fixture_visit;

-- One encounter per visit, 97% finished.
INSERT INTO encounters (
  id, registration_id, patient_id, doctor_id, status, started_at, ended_at, created_at, updated_at
)
SELECT
  encounter_id,
  registration_id,
  patient_id,
  doctor_id,
  CASE WHEN roll_status < 0.03 THEN 'IN_PROGRESS'::"EncounterStatus" ELSE 'FINISHED'::"EncounterStatus" END,
  registered_at + interval '25 minutes',
  CASE WHEN roll_status >= 0.03 THEN registered_at + interval '40 minutes' END,
  registered_at,
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000;

-- A primary diagnosis on ~97% of encounters from a skewed list of 40 codes,
-- and a secondary on ~30%.
INSERT INTO diagnoses (id, encounter_id, code, display, type, recorded_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  encounter_id,
  'X' || lpad((1 + floor(power(random(), 2) * 40))::int::text, 2, '0'),
  'Fixture diagnosis',
  'PRIMARY'::"DiagnosisType",
  registered_at + interval '35 minutes',
  registered_at,
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000 AND roll_extra < 0.97;

INSERT INTO diagnoses (id, encounter_id, code, display, type, recorded_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  encounter_id,
  'Y' || lpad((1 + floor(random() * 60))::int::text, 2, '0'),
  'Fixture secondary diagnosis',
  'SECONDARY'::"DiagnosisType",
  registered_at + interval '36 minutes',
  registered_at,
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000 AND roll_extra < 0.30;

INSERT INTO prescriptions (
  id, patient_id, doctor_id, encounter_id, status, fulfilment_site, charge_mode,
  issued_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  patient_id,
  doctor_id,
  encounter_id,
  CASE WHEN roll_extra < 0.05 THEN 'ISSUED'::"PrescriptionStatus" ELSE 'DISPENSED'::"PrescriptionStatus" END,
  'INTERNAL'::fulfilment_site,
  'CLINIC'::charge_mode,
  registered_at + interval '38 minutes',
  registered_at,
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000 AND roll_type < 0.70;

INSERT INTO lab_orders (
  id, encounter_id, registration_id, source, patient_id, ordered_by_id, order_number,
  status, fulfilment_site, charge_mode, ordered_at, released_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  -- A walk-in lab order has no encounter (check constraint).
  CASE WHEN roll_type >= 0.90 THEN NULL ELSE encounter_id END,
  registration_id,
  CASE WHEN roll_type >= 0.90 THEN 'WALK_IN'::lab_order_source ELSE 'ENCOUNTER'::lab_order_source END,
  patient_id,
  doctor_id,
  'PERF-LAB-' || visit_no,
  CASE WHEN roll_extra < 0.9 THEN 'RELEASED'::lab_order_status ELSE 'ORDERED'::lab_order_status END,
  'INTERNAL'::fulfilment_site,
  'CLINIC'::charge_mode,
  registered_at + interval '30 minutes',
  CASE WHEN roll_extra < 0.9 THEN registered_at + interval '3 hours' END,
  registered_at,
  registered_at
FROM fixture_visit
WHERE visit_no <= 50000 AND (roll_type >= 0.90 OR roll_channel < 0.07)
LIMIT 8000;

-- 60 000 invoices: one per visit, plus 10 000 counter sales (pharmacy and lab
-- walk-ins) on registrations only. ~94% paid, a few voided or still open.
CREATE TEMP TABLE fixture_invoice AS
SELECT
  gen_random_uuid() AS invoice_id,
  v.visit_no,
  v.patient_id,
  -- Exactly one episode per invoice (check constraint): the encounter for a
  -- visit, the registration for a counter sale.
  CASE WHEN v.is_counter_sale THEN NULL ELSE v.encounter_id END AS encounter_id,
  CASE WHEN v.is_counter_sale THEN v.registration_id END AS registration_id,
  v.registered_at + interval '60 minutes' AS issued_at,
  (50000 + floor(random() * 450000))::numeric AS total_amount,
  random() AS roll_status,
  random() AS roll_method
FROM (
  SELECT *, false AS is_counter_sale FROM fixture_visit WHERE visit_no <= 50000
  UNION ALL
  SELECT *, true AS is_counter_sale FROM fixture_visit WHERE visit_no <= 10000
) AS v;

INSERT INTO invoices (
  id, invoice_number, encounter_id, registration_id, patient_id, status,
  total_amount, tax_amount, issued_at, created_at, updated_at
)
SELECT
  invoice_id,
  'PERF-INV-' || row_number() OVER (ORDER BY issued_at, invoice_id),
  encounter_id,
  registration_id,
  patient_id,
  CASE
    WHEN roll_status < 0.02 THEN 'VOID'::"InvoiceStatus"
    WHEN roll_status < 0.06 THEN 'ISSUED'::"InvoiceStatus"
    ELSE 'PAID'::"InvoiceStatus"
  END,
  total_amount,
  0,
  issued_at,
  issued_at,
  issued_at
FROM fixture_invoice;

INSERT INTO payments (id, invoice_id, method, amount, paid_at, cashier_id, created_at, updated_at)
SELECT
  gen_random_uuid(),
  invoice_id,
  CASE
    WHEN roll_method < 0.45 THEN 'CASH'::"PaymentMethod"
    WHEN roll_method < 0.75 THEN 'QRIS'::"PaymentMethod"
    WHEN roll_method < 0.90 THEN 'TRANSFER'::"PaymentMethod"
    ELSE 'INSURANCE'::"PaymentMethod"
  END,
  total_amount,
  issued_at + interval '5 minutes',
  'a0000000-0000-4000-8000-000000000001',
  issued_at,
  issued_at
FROM fixture_invoice
WHERE roll_status >= 0.06;

-- Two lines per invoice (P29-T08): the service, and what was dispensed, so
-- the revenue-by-service query sums a realistic number of lines.
INSERT INTO invoice_items (
  id, invoice_id, item_type, description, quantity, unit_price, amount, created_at, updated_at
)
SELECT gen_random_uuid(), invoice_id, line.item_type, line.description, 1, line.amount, line.amount,
       issued_at, issued_at
FROM fixture_invoice
CROSS JOIN LATERAL (
  VALUES
    (
      CASE WHEN encounter_id IS NULL THEN 'LAB'::"InvoiceItemType" ELSE 'CONSULTATION'::"InvoiceItemType" END,
      'Perf service',
      total_amount - floor(total_amount * 0.4)
    ),
    ('MEDICATION'::"InvoiceItemType", 'Perf medication', floor(total_amount * 0.4))
) AS line(item_type, description, amount);

INSERT INTO satusehat_submissions (
  id, encounter_id, kind, status, attempts, next_attempt_at, submitted_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  encounter_id,
  'ENCOUNTER'::satusehat_submission_kind,
  CASE
    WHEN roll_extra < 0.02 THEN 'FAILED'::"SatusehatSubmissionStatus"
    WHEN roll_extra < 0.05 THEN 'PENDING'::"SatusehatSubmissionStatus"
    ELSE 'SUBMITTED'::"SatusehatSubmissionStatus"
  END,
  1,
  registered_at + interval '2 hours',
  CASE WHEN roll_extra >= 0.05 THEN registered_at + interval '2 hours' END,
  registered_at + interval '1 hour',
  registered_at + interval '2 hours'
FROM fixture_visit
WHERE visit_no <= 50000;

-- BPJS: PENDAFTARAN and KUNJUNGAN for the ~20% of visits booked through
-- Mobile JKN or registered as BPJS at the desk.
INSERT INTO bpjs_submissions (
  id, registration_id, type, status, attempts, next_attempt_at, submitted_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  v.registration_id,
  t.type,
  CASE
    WHEN v.roll_extra < 0.03 THEN 'FAILED'::"BpjsSubmissionStatus"
    WHEN v.roll_extra < 0.06 THEN 'PENDING'::"BpjsSubmissionStatus"
    ELSE 'SUBMITTED'::"BpjsSubmissionStatus"
  END,
  1,
  v.registered_at + interval '1 hour',
  CASE WHEN v.roll_extra >= 0.06 THEN v.registered_at + interval '1 hour' END,
  v.registered_at,
  v.registered_at
FROM fixture_visit v
CROSS JOIN (VALUES ('PENDAFTARAN'::"BpjsSubmissionType"), ('KUNJUNGAN'::"BpjsSubmissionType")) AS t(type)
WHERE v.visit_no <= 50000 AND v.roll_channel >= 0.25 AND v.roll_channel < 0.45;

-- Who pays (P29-T07): BPJS where a kunjungan went to PCare, as the migration's
-- backfill decides, and otherwise a fixed spread keyed on the row's id.
UPDATE registrations r
SET payer_type = (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM bpjs_submissions s WHERE s.registration_id = r.id AND s.type = 'KUNJUNGAN'
    ) THEN 'BPJS'
    WHEN abs(hashtext(r.id::text)) % 20 < 17 THEN 'GENERAL'
    ELSE 'INSURANCE'
  END
)::payer_type;

ANALYZE;
