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
  medianWaitMinutes: 18,
  p90WaitMinutes: 41,
  excludedWaitIntervals: 2,
  medianConsultMinutes: 11,
  p90ConsultMinutes: 23,
  excludedConsultIntervals: 14,
  sessionUtilisationPercent: 82,
  // `null` when the rooms and inpatient feature is off.
  inpatient: optionalExample({
    admissions: 57,
    discharges: 54,
    averageLengthOfStayDays: 2.4,
    bedOccupancyPercent: 64,
  }),
};

const operationsSeries = [
  { bucket: '2026-09-01', visits: 44, consultation: 40, labOnly: 3, admission: 1 },
  { bucket: '2026-09-02', visits: 51, consultation: 46, labOnly: 3, admission: 2 },
];

const financeTotals = {
  revenue: 196_250_000,
  taxAmount: 2_140_000,
  invoices: 1_208,
  invoicedVisits: 1_188,
  // `null` with no invoice in the period.
  revenuePerVisit: 165_194,
  unpaidInvoices: 41,
  unpaidAmount: 9_800_000,
  cashReceived: 186_400_000,
  payments: 1_147,
  voidedInvoices: 7,
  voidedAmount: 1_200_000,
};

const financeSeries = [
  { bucket: '2026-09-01', revenue: 6_420_000, cashReceived: 6_110_000 },
  { bucket: '2026-09-02', revenue: 7_150_500, cashReceived: 6_980_000 },
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
          busiestHours: [{ weekday: 1, hour: 8, checkIns: 96 }],
          sessions: {
            cappedSessions: 88,
            capacity: 1760,
            bookedAppointments: 1443,
            movedSessions: 2,
            cancelledSessions: 1,
          },
          // `null` when the rooms and inpatient feature is off.
          inpatientDispositions: optionalExample([{ disposition: 'HOME', discharges: 48 }]),
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
  finance: {
    response: {
      data: {
        totals: financeTotals,
        series: financeSeries,
        breakdowns: {
          paymentMethods: [
            { method: 'CASH', payments: 512, amount: 82_016_000 },
            { method: 'QRIS', payments: 318, amount: 50_328_000 },
          ],
          itemTypes: [{ itemType: 'MEDICATION', lines: 2_480, amount: 71_400_000, taxAmount: 0 }],
          // The unattributed row (`doctorId: null`) comes last.
          doctors: [
            {
              doctorId: DOCTOR_ID,
              doctorName: 'dr. Rina Kartika',
              specialtyName: 'Poli Umum',
              invoices: 418,
              visits: 412,
              revenue: 61_200_000,
              revenuePerVisit: 148_544,
              previousRevenue: optionalExample(56_150_000),
            },
          ],
          poli: [
            {
              specialtyId: POLI_UMUM_ID,
              specialtyName: 'Poli Umum',
              invoices: 640,
              revenue: 95_000_000,
              previousRevenue: optionalExample(88_400_000),
            },
          ],
          // General, BPJS, insurance, then `payerType: null` ("not recorded").
          payers: [{ payerType: 'GENERAL', visits: 649, invoices: 640, revenue: 139_300_000 }],
          outstanding: {
            invoices: 41,
            amount: 9_800_000,
            aging: [
              { bucket: '0-7', invoices: 26, amount: 5_900_000 },
              { bucket: '8-30', invoices: 11, amount: 3_100_000 },
              { bucket: 'over-30', invoices: 4, amount: 800_000 },
            ],
          },
        },
        // Only with `compare=true`.
        comparison: optionalExample({
          from: '2026-08-01',
          to: '2026-08-31',
          totals: { ...financeTotals, revenue: 176_400_000 },
          series: financeSeries,
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
  caseMix: {
    response: {
      data: {
        totals: {
          finishedEncounters: 1_086,
          codedEncounters: 1_014,
          uncodedEncounters: 72,
          // `null` with no finished encounter.
          codingCompletenessPercent: 93.4,
          distinctCodes: 184,
        },
        series: [{ bucket: '2026-09-01', finishedEncounters: 38, codedEncounters: 36 }],
        breakdowns: {
          // Ten codes, then `OTHER` and `UNCODED`; a count of 1–4 is `{ suppressed: true }`.
          topDiagnoses: [
            {
              kind: 'CODE',
              code: optionalExample('J06.9'),
              name: optionalExample('ISPA akut, tidak spesifik'),
              count: 142,
              sharePercent: optionalExample(13.1),
            },
          ],
          groups: [
            {
              kind: 'CODE',
              group: optionalExample('J'),
              count: 262,
              sharePercent: optionalExample(24.1),
            },
          ],
          codingByPoli: [
            {
              specialtyId: optionalExample(POLI_UMUM_ID),
              specialtyName: optionalExample('Poli Umum'),
              finishedEncounters: 612,
              uncodedEncounters: 41,
              codingCompletenessPercent: optionalExample(93.3),
            },
          ],
          topProcedures: [
            {
              kind: 'CODE',
              code: optionalExample('23.2'),
              name: optionalExample('Restorasi gigi'),
              count: 61,
            },
          ],
        },
        comparison: optionalExample({
          from: '2026-08-01',
          to: '2026-08-31',
          totals: {
            finishedEncounters: 1_009,
            codedEncounters: 921,
            uncodedEncounters: 88,
            codingCompletenessPercent: 91.3,
            distinctCodes: 178,
          },
          series: [{ bucket: '2026-08-01', finishedEncounters: 31, codedEncounters: 28 }],
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
