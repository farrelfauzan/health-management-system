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
  pharmacy: {
    response: {
      data: {
        totals: {
          prescriptionsIssued: 874,
          fullyDispensed: 812,
          partiallyDispensed: 21,
          cancelled: 12,
          awaitingDispense: 29,
          // Sent to an outside apotek; left out of `fullyDispensedPercent`.
          filledElsewhere: 0,
          // `null` with nothing issued, or no dispense to time.
          fullyDispensedPercent: optionalExample(92.9),
          medianDispenseMinutes: optionalExample(14),
          medicationRevenue: 71_400_000,
        },
        series: [
          {
            bucket: '2026-09-01',
            prescriptionsIssued: 31,
            fullyDispensed: 29,
            medicationRevenue: 2_380_000,
          },
        ],
        breakdowns: {
          topMedications: [
            {
              medicationId: '7d2e1b3a-4c5f-4e8d-a0b9-1c2d3e4f5a6b',
              code: 'PCT500',
              name: 'Paracetamol',
              strength: optionalExample('500 mg'),
              unit: optionalExample('TABLET'),
              quantity: 3_420,
              dispenses: 402,
            },
          ],
          // Now, whatever the filter says.
          stock: {
            asOfDate: '2026-09-30',
            reorderCount: 9,
            reorder: [
              {
                medicationId: '8e3f2c4b-5d6a-4f9e-b1c0-2d3e4f5a6b7c',
                code: 'AMX500',
                name: 'Amoksisilin',
                strength: optionalExample('500 mg'),
                unit: optionalExample('KAPSUL'),
                stock: 40,
                reorderLevel: 50,
                averageDailyDispensed: 33,
                // `null` when nothing was dispensed in the last thirty days.
                daysOfCover: optionalExample(1.2),
              },
            ],
            expiring: [{ window: 'WITHIN_30_DAYS', batches: 3, units: 240, medications: 3 }],
          },
        },
        comparison: optionalExample({
          from: '2026-08-01',
          to: '2026-08-31',
          totals: {
            prescriptionsIssued: 823,
            fullyDispensed: 753,
            partiallyDispensed: 24,
            cancelled: 15,
            awaitingDispense: 31,
            filledElsewhere: 0,
            fullyDispensedPercent: 91.5,
            medianDispenseMinutes: 12,
            medicationRevenue: 65_000_000,
          },
          series: [
            {
              bucket: '2026-08-01',
              prescriptionsIssued: 27,
              fullyDispensed: 25,
              medicationRevenue: 2_100_000,
            },
          ],
        }),
      },
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-30T07:32:00.000Z',
      },
    },
  },
  laboratory: {
    response: {
      data: {
        totals: {
          orders: 486,
          released: 452,
          inProgress: 18,
          // Run by an outside lab; never released here.
          sentOut: 0,
          cancelled: 16,
          // `null` until an order is released.
          medianTurnaroundMinutes: optionalExample(52),
          p90TurnaroundMinutes: optionalExample(130),
          recollectedOrders: 11,
          // `null` with nothing to divide by.
          recollectionRatePercent: optionalExample(2.3),
          cancellationRatePercent: optionalExample(3.3),
        },
        series: [{ bucket: '2026-09-01', orders: 17, released: 16 }],
        breakdowns: {
          sources: [{ source: 'ENCOUNTER', orders: 371 }],
          tests: [
            {
              labTestId: '9f4a3d5c-6e7b-4a0f-c2d1-3e4f5a6b7c8d',
              code: 'CBC',
              name: 'Darah lengkap',
              orders: 168,
              releasedOrders: 160,
              medianTurnaroundMinutes: optionalExample(45),
              p90TurnaroundMinutes: optionalExample(80),
            },
          ],
        },
        comparison: optionalExample({
          from: '2026-08-01',
          to: '2026-08-31',
          totals: {
            orders: 464,
            released: 430,
            inProgress: 12,
            sentOut: 0,
            cancelled: 22,
            medianTurnaroundMinutes: 58,
            p90TurnaroundMinutes: 115,
            recollectedOrders: 12,
            recollectionRatePercent: 2.7,
            cancellationRatePercent: 4.7,
          },
          series: [{ bucket: '2026-08-01', orders: 15, released: 14 }],
        }),
      },
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-30T07:32:00.000Z',
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
