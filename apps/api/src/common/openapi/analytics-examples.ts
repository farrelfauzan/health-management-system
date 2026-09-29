import { optionalExample } from './api-endpoint.decorator';

const POLI_UMUM_ID = '5b0c9f1e-2a3d-4c6b-8e7f-9a0b1c2d3e4f';
const DOCTOR_ID = '6c1d0a2f-3b4e-4d7c-9f8a-0b1c2d3e4f5a';

const operationsTotals = {
  visits: 1248,
  newPatients: 312,
  returningPatients: 936,
  walkIns: 574,
  appointments: 729,
  completedAppointments: 610,
  noShowAppointments: 65,
  // `null` when no appointment was completed or missed.
  noShowRatePercent: 9.6,
};

const operationsSeries = [
  { bucket: '2026-09-01', visits: 44, consultation: 40, labOnly: 3, admission: 1 },
  { bucket: '2026-09-02', visits: 51, consultation: 46, labOnly: 3, admission: 2 },
];

/** Request and response examples for the P29 analytics endpoints. */
export const ANALYTICS_EXAMPLES = {
  operations: {
    response: {
      data: {
        totals: operationsTotals,
        series: operationsSeries,
        breakdowns: {
          visitsByType: [
            { type: 'CONSULTATION', visits: 1121 },
            { type: 'LAB_ONLY', visits: 70 },
            { type: 'ADMISSION', visits: 57 },
          ],
          visitsByPoli: [
            {
              specialtyId: POLI_UMUM_ID,
              specialtyName: 'Poli Umum',
              visits: 640,
              // Only with `compare=true`.
              previousVisits: optionalExample(604),
            },
          ],
          visitsByDoctor: [
            {
              doctorId: DOCTOR_ID,
              doctorName: 'dr. Sari Wulandari',
              visits: 402,
              previousVisits: optionalExample(377),
            },
          ],
          appointmentOutcomes: [
            { status: 'COMPLETED', appointments: 610 },
            { status: 'NO_SHOW', appointments: 65 },
          ],
          // The schema is inferred from the first row, so a numeric rate
          // leads; the API itself lists WALK_IN first, with a null rate.
          bookingChannels: [
            {
              channel: 'WHATSAPP',
              bookings: 168,
              completed: 144,
              noShows: 24,
              noShowRatePercent: 14.3,
            },
            {
              channel: 'WALK_IN',
              bookings: 574,
              completed: 574,
              noShows: 0,
              noShowRatePercent: null,
            },
          ],
        },
        // Only with `compare=true`.
        comparison: optionalExample({
          from: '2026-08-01',
          to: '2026-08-31',
          totals: { ...operationsTotals, visits: 1151 },
          series: operationsSeries,
        }),
      },
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-28T02:00:00.000Z',
      },
    },
  },
  reportingHealth: {
    response: {
      data: {
        satusehat: [
          {
            kind: 'ENCOUNTER',
            submitted: 1058,
            pending: 12,
            failed: 3,
            // `null` when nothing of this kind is waiting.
            oldestPendingAt: '2026-09-28T05:18:00.000Z',
          },
        ],
        // `null` when neither BPJS feature is on.
        bpjs: [{ type: 'PENDAFTARAN', submitted: 410, pending: 0, failed: 1 }],
        readiness: { encountersWithoutPrimaryDiagnosis: 72, encountersWithUnlinkedClinician: 0 },
      },
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-28T07:32:00.000Z',
      },
    },
  },
} as const;
