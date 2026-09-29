import type { AnalyticsBenchmarkQuery } from './analytics-benchmark.types';

// A visit (P29-T04): a registration checked in or completed, in the range,
// narrowed by poli and, through its encounter, by doctor.
const VISIT_FILTER = `
  r.deleted_at IS NULL
  AND r.status IN ('CHECKED_IN', 'COMPLETED')
  AND r.registered_at >= $1::timestamp
  AND r.registered_at < $2::timestamp
  AND ($3::uuid IS NULL OR EXISTS (
    SELECT 1 FROM encounters e
    WHERE e.registration_id = r.id AND e.doctor_id = $3::uuid AND e.deleted_at IS NULL
  ))
  AND ($4::uuid IS NULL OR r.specialty_id = $4::uuid)`;

const VISIT_PARAMS = ['startUtc', 'endUtc', 'doctorId', 'specialtyId'] as const;

// An appointment in the range, narrowed by doctor and by the doctor's poli.
const APPOINTMENT_FILTER = `
  a.deleted_at IS NULL
  AND a.scheduled_at >= $1::timestamp
  AND a.scheduled_at < $2::timestamp
  AND ($3::uuid IS NULL OR a.doctor_id = $3::uuid)
  AND ($4::uuid IS NULL OR a.doctor_id IN (
    SELECT d.id FROM doctor_profiles d WHERE d.specialty_id = $4::uuid
  ))`;

// An invoice aliased `i` joined to the visit it bills (P29-T08): its own
// registration, its encounter's, or for a stay the referring encounter's.
const INVOICE_VISIT_JOINS = `
  LEFT JOIN encounters e ON e.id = i.encounter_id
  LEFT JOIN admissions ad ON ad.id = i.admission_id
  LEFT JOIN encounters se ON se.id = ad.source_encounter_id
  LEFT JOIN registrations r
    ON r.id = COALESCE(i.registration_id, e.registration_id, se.registration_id)`;

// Narrowed by the clinician of the invoice's encounter and the visit's poli.
const INVOICE_NARROWING = `
  AND ($3::uuid IS NULL OR e.doctor_id = $3::uuid)
  AND ($4::uuid IS NULL OR r.specialty_id = $4::uuid)`;

// Revenue by invoice date (Q-3): issued and paid invoices issued in the range.
const REVENUE_FILTER = `
  i.deleted_at IS NULL
  AND i.status IN ('ISSUED', 'PAID')
  AND i.issued_at >= $1::timestamp
  AND i.issued_at < $2::timestamp
  ${INVOICE_NARROWING}`;

const FINANCE_PARAMS = ['startUtc', 'endUtc', 'doctorId', 'specialtyId'] as const;

/**
 * The candidate SQL for every Sprint 1 analytics query (P29-T04 operations,
 * P29-T06 reporting status) and the P29-T08 finance queries, as shipped.
 * The shapes follow the ticket definitions; T04 and T06 are expected to
 * adopt them, and re-run the benchmark if they change a join.
 */
export const ANALYTICS_BENCHMARK_QUERIES: readonly AnalyticsBenchmarkQuery[] = [
  {
    id: 'visits-by-bucket-and-type',
    requirement: 'FR-OPS-01',
    dashboard: 'operations',
    params: [...VISIT_PARAMS, 'granularity', 'timeZone'],
    sql: `
      SELECT date_trunc($5, (r.registered_at AT TIME ZONE 'UTC') AT TIME ZONE $6) AS bucket,
             r.type, count(*)::int AS visits
      FROM registrations r
      WHERE ${VISIT_FILTER}
      GROUP BY 1, 2`,
  },
  {
    id: 'new-vs-returning',
    requirement: 'FR-OPS-02',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      WITH period_patients AS (
        SELECT DISTINCT r.patient_id FROM registrations r WHERE ${VISIT_FILTER}
      ),
      first_visit AS (
        SELECT v.patient_id, min(v.registered_at) AS first_at
        FROM registrations v
        JOIN period_patients p ON p.patient_id = v.patient_id
        WHERE v.deleted_at IS NULL AND v.status IN ('CHECKED_IN', 'COMPLETED')
        GROUP BY v.patient_id
      )
      SELECT count(*) FILTER (WHERE first_at >= $1::timestamp)::int AS new_patients,
             count(*) FILTER (WHERE first_at < $1::timestamp)::int AS returning_patients
      FROM first_visit`,
  },
  {
    id: 'visits-by-poli',
    requirement: 'FR-OPS-03',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      SELECT r.specialty_id, count(*)::int AS visits
      FROM registrations r
      WHERE ${VISIT_FILTER}
      GROUP BY r.specialty_id`,
  },
  {
    id: 'visits-by-doctor',
    requirement: 'FR-OPS-03',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      SELECT e.doctor_id, count(*)::int AS visits
      FROM registrations r
      JOIN encounters e ON e.registration_id = r.id AND e.deleted_at IS NULL
      WHERE ${VISIT_FILTER}
      GROUP BY e.doctor_id`,
  },
  {
    id: 'appointment-outcomes',
    requirement: 'FR-OPS-04',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      SELECT a.status, count(*)::int AS appointments
      FROM appointments a
      WHERE ${APPOINTMENT_FILTER}
      GROUP BY a.status`,
  },
  {
    id: 'booking-channel',
    requirement: 'FR-OPS-05',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      SELECT CASE
               WHEN a.bpjs_booking_code IS NOT NULL THEN 'MOBILE_JKN'
               WHEN a.booking_source IS NULL THEN 'STAFF'
               ELSE a.booking_source::text
             END AS channel,
             count(*)::int AS bookings,
             count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
             count(*) FILTER (WHERE a.status = 'NO_SHOW')::int AS no_shows
      FROM appointments a
      WHERE ${APPOINTMENT_FILTER}
      GROUP BY 1`,
  },
  {
    id: 'walk-in-visits',
    requirement: 'FR-OPS-05',
    dashboard: 'operations',
    params: VISIT_PARAMS,
    sql: `
      SELECT count(*)::int AS walk_ins
      FROM registrations r
      WHERE ${VISIT_FILTER} AND r.appointment_id IS NULL`,
  },
  {
    id: 'satusehat-by-kind-and-status',
    requirement: 'FR-INT-01',
    dashboard: 'reporting',
    params: ['startUtc', 'endUtc'],
    sql: `
      SELECT s.kind, s.status, count(*)::int AS submissions
      FROM satusehat_submissions s
      WHERE s.created_at >= $1::timestamp AND s.created_at < $2::timestamp
      GROUP BY s.kind, s.status`,
  },
  {
    id: 'satusehat-oldest-pending',
    requirement: 'FR-INT-01',
    dashboard: 'reporting',
    params: [],
    sql: `
      SELECT s.kind, min(s.created_at) AS oldest_pending_at, count(*)::int AS pending
      FROM satusehat_submissions s
      WHERE s.status = 'PENDING'
      GROUP BY s.kind`,
  },
  {
    id: 'bpjs-by-type-and-status',
    requirement: 'FR-INT-02',
    dashboard: 'reporting',
    params: ['startUtc', 'endUtc'],
    sql: `
      SELECT b.type, b.status, count(*)::int AS submissions
      FROM bpjs_submissions b
      WHERE b.created_at >= $1::timestamp AND b.created_at < $2::timestamp
      GROUP BY b.type, b.status`,
  },
  {
    id: 'finished-without-primary-diagnosis',
    requirement: 'T06 "Siap dikirim?"',
    dashboard: 'reporting',
    params: ['startUtc', 'endUtc'],
    sql: `
      SELECT count(*)::int AS encounters_without_primary_diagnosis
      FROM encounters e
      WHERE e.deleted_at IS NULL
        AND e.status = 'FINISHED'
        AND e.started_at >= $1::timestamp AND e.started_at < $2::timestamp
        AND NOT EXISTS (
          SELECT 1 FROM diagnoses d
          WHERE d.encounter_id = e.id AND d.type = 'PRIMARY' AND d.deleted_at IS NULL
        )`,
  },
  {
    id: 'revenue-by-bucket',
    requirement: 'FR-FIN-01',
    dashboard: 'finance',
    params: [...FINANCE_PARAMS, 'granularity', 'timeZone'],
    sql: `
      SELECT date_trunc($5, (i.issued_at AT TIME ZONE 'UTC') AT TIME ZONE $6) AS bucket,
             count(*)::int AS invoices, sum(i.total_amount) AS revenue, sum(i.tax_amount) AS tax,
             sum(i.total_amount) FILTER (WHERE i.status = 'ISSUED') AS unpaid
      FROM invoices i ${INVOICE_VISIT_JOINS}
      WHERE ${REVENUE_FILTER}
      GROUP BY 1`,
  },
  {
    id: 'cash-by-bucket-and-method',
    requirement: 'FR-FIN-02',
    dashboard: 'finance',
    params: [...FINANCE_PARAMS, 'granularity', 'timeZone'],
    sql: `
      SELECT date_trunc($5, (p.paid_at AT TIME ZONE 'UTC') AT TIME ZONE $6) AS bucket,
             p.method, sum(p.amount) AS amount, count(*)::int AS payments
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id ${INVOICE_VISIT_JOINS}
      WHERE p.paid_at >= $1::timestamp AND p.paid_at < $2::timestamp ${INVOICE_NARROWING}
      GROUP BY 1, 2`,
  },
  {
    id: 'revenue-by-item-type',
    requirement: 'FR-FIN-03',
    dashboard: 'finance',
    params: FINANCE_PARAMS,
    sql: `
      SELECT it.item_type, count(*)::int AS lines, sum(it.amount) AS amount, sum(it.tax_amount) AS tax
      FROM invoice_items it
      JOIN invoices i ON i.id = it.invoice_id ${INVOICE_VISIT_JOINS}
      WHERE ${REVENUE_FILTER}
      GROUP BY 1`,
  },
  {
    id: 'revenue-by-doctor',
    requirement: 'FR-FIN-04',
    dashboard: 'finance',
    params: FINANCE_PARAMS,
    sql: `
      SELECT e.doctor_id, d.full_name, ds.name, count(*)::int AS invoices,
             count(DISTINCT COALESCE(r.id, i.id))::int AS visits, sum(i.total_amount) AS revenue
      FROM invoices i ${INVOICE_VISIT_JOINS}
      LEFT JOIN doctor_profiles d ON d.id = e.doctor_id
      LEFT JOIN specialties ds ON ds.id = d.specialty_id
      WHERE ${REVENUE_FILTER}
      GROUP BY 1, 2, 3`,
  },
  {
    id: 'revenue-by-poli-and-payer',
    requirement: 'FR-FIN-04, FR-FIN-06',
    dashboard: 'finance',
    params: FINANCE_PARAMS,
    sql: `
      SELECT r.specialty_id, r.payer_type, count(*)::int AS invoices,
             count(DISTINCT COALESCE(r.id, i.id))::int AS visits, sum(i.total_amount) AS revenue
      FROM invoices i ${INVOICE_VISIT_JOINS}
      WHERE ${REVENUE_FILTER}
      GROUP BY 1, 2`,
  },
  {
    id: 'visits-by-payer',
    requirement: 'FR-FIN-06',
    dashboard: 'finance',
    params: VISIT_PARAMS,
    sql: `
      SELECT r.payer_type, count(*)::int AS visits
      FROM registrations r
      WHERE ${VISIT_FILTER}
      GROUP BY 1`,
  },
  {
    id: 'outstanding-by-age',
    requirement: 'FR-FIN-05',
    dashboard: 'finance',
    params: ['doctorId', 'specialtyId', 'timeZone'],
    sql: `
      SELECT CASE
               WHEN age <= 7 THEN '0-7' WHEN age <= 30 THEN '8-30' ELSE 'over-30'
             END AS bucket,
             count(*)::int AS invoices, sum(total_amount) AS amount
      FROM (
        SELECT i.total_amount,
               (now() AT TIME ZONE $3)::date
                 - ((i.issued_at AT TIME ZONE 'UTC') AT TIME ZONE $3)::date AS age
        FROM invoices i ${INVOICE_VISIT_JOINS}
        WHERE i.deleted_at IS NULL AND i.status = 'ISSUED' AND i.issued_at IS NOT NULL
          AND ($1::uuid IS NULL OR e.doctor_id = $1::uuid)
          AND ($2::uuid IS NULL OR r.specialty_id = $2::uuid)
      ) aged
      GROUP BY 1`,
  },
];
