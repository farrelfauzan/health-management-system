import type {
  AnalyticsFinancePeriodSnapshot,
  AnalyticsFinanceSnapshot,
  AnalyticsRange,
} from '@hms/shared-types';

import { buildAnalyticsFinanceData } from './build-analytics-finance-data';

const SEPTEMBER: AnalyticsRange = {
  from: '2026-09-01',
  to: '2026-09-03',
  timeZone: 'Asia/Jakarta',
  granularity: 'day',
  dayCount: 3,
  start: new Date('2026-08-31T17:00:00.000Z'),
  end: new Date('2026-09-03T17:00:00.000Z'),
};

const EMPTY_SNAPSHOT: AnalyticsFinanceSnapshot = {
  revenueBuckets: [],
  cashBuckets: [],
  paymentMethods: [],
  itemTypes: [],
  doctors: [],
  poli: [],
  payerRevenue: [],
  payerVisits: [],
  invoicedVisits: 0,
  voids: { invoices: 0, amountCents: 0 },
  outstanding: [],
};

function buildPeriod(snapshot: Partial<AnalyticsFinanceSnapshot>): AnalyticsFinancePeriodSnapshot {
  return { range: SEPTEMBER, snapshot: { ...EMPTY_SNAPSHOT, ...snapshot } };
}

describe('buildAnalyticsFinanceData', () => {
  it('sums revenue in cents and divides it by the visits billed', () => {
    const inputPeriod = buildPeriod({
      revenueBuckets: [
        {
          bucket: '2026-09-01',
          invoices: 2,
          revenueCents: 25_000_050,
          taxCents: 1_100_000,
          unpaidInvoices: 1,
          unpaidCents: 5_000_000,
        },
        {
          bucket: '2026-09-03',
          invoices: 1,
          revenueCents: 10_000_000,
          taxCents: 0,
          unpaidInvoices: 0,
          unpaidCents: 0,
        },
      ],
      cashBuckets: [{ bucket: '2026-09-02', payments: 2, amountCents: 30_000_050 }],
      invoicedVisits: 3,
      voids: { invoices: 1, amountCents: 8_000_000 },
    });

    const actual = buildAnalyticsFinanceData({ current: inputPeriod });

    expect(actual.totals).toEqual({
      revenue: 350_000.5,
      taxAmount: 11_000,
      invoices: 3,
      invoicedVisits: 3,
      revenuePerVisit: 116_667,
      unpaidInvoices: 1,
      unpaidAmount: 50_000,
      cashReceived: 300_000.5,
      payments: 2,
      voidedInvoices: 1,
      voidedAmount: 80_000,
    });
  });

  it('has no revenue per visit when nothing was billed', () => {
    const actual = buildAnalyticsFinanceData({ current: buildPeriod({}) });

    expect(actual.totals.revenuePerVisit).toBeNull();
  });

  it('puts every day on the trend, quiet days at zero, revenue and cash side by side', () => {
    const inputPeriod = buildPeriod({
      revenueBuckets: [
        {
          bucket: '2026-09-01',
          invoices: 1,
          revenueCents: 10_000_000,
          taxCents: 0,
          unpaidInvoices: 0,
          unpaidCents: 0,
        },
      ],
      cashBuckets: [{ bucket: '2026-09-02', payments: 1, amountCents: 10_000_000 }],
    });

    const actual = buildAnalyticsFinanceData({ current: inputPeriod });

    expect(actual.series).toEqual([
      { bucket: '2026-09-01', revenue: 100_000, cashReceived: 0 },
      { bucket: '2026-09-02', revenue: 0, cashReceived: 100_000 },
      { bucket: '2026-09-03', revenue: 0, cashReceived: 0 },
    ]);
  });

  it('lists every payment method in a fixed order, zero rows included', () => {
    const inputPeriod = buildPeriod({
      paymentMethods: [{ method: 'QRIS', payments: 2, amountCents: 4_000_000 }],
    });

    const actual = buildAnalyticsFinanceData({ current: inputPeriod });

    expect(actual.breakdowns.paymentMethods).toEqual([
      { method: 'CASH', payments: 0, amount: 0 },
      { method: 'TRANSFER', payments: 0, amount: 0 },
      { method: 'QRIS', payments: 2, amount: 40_000 },
      { method: 'INSURANCE', payments: 0, amount: 0 },
    ]);
  });

  it('ranks clinicians by revenue, keeps the unattributed row last and shows one who went quiet', () => {
    const current = buildPeriod({
      doctors: [
        {
          doctorId: null,
          doctorName: null,
          specialtyName: null,
          invoices: 5,
          visits: 5,
          revenueCents: 90_000_000,
        },
        {
          doctorId: 'doctor-a',
          doctorName: 'dr. A',
          specialtyName: 'Umum',
          invoices: 4,
          visits: 3,
          revenueCents: 30_000_000,
        },
      ],
    });
    const comparison = buildPeriod({
      doctors: [
        {
          doctorId: 'doctor-a',
          doctorName: 'dr. A',
          specialtyName: 'Umum',
          invoices: 1,
          visits: 1,
          revenueCents: 10_000_000,
        },
        {
          doctorId: 'doctor-b',
          doctorName: 'dr. B',
          specialtyName: 'Gigi',
          invoices: 2,
          visits: 2,
          revenueCents: 20_000_000,
        },
      ],
    });

    const actual = buildAnalyticsFinanceData({ current, comparison });

    expect(
      actual.breakdowns.doctors.map((row) => [row.doctorId, row.revenue, row.previousRevenue]),
    ).toEqual([
      ['doctor-a', 300_000, 100_000],
      ['doctor-b', 0, 200_000],
      [null, 900_000, 0],
    ]);
    expect(actual.breakdowns.doctors[0]?.revenuePerVisit).toBe(100_000);
  });

  it('shows all four payer rows, "not recorded" last, visits beside revenue', () => {
    const inputPeriod = buildPeriod({
      payerRevenue: [{ payerType: 'BPJS', invoices: 3, revenueCents: 30_000_000 }],
      payerVisits: [
        { payerType: 'BPJS', visits: 4 },
        { payerType: null, visits: 2 },
      ],
    });

    const actual = buildAnalyticsFinanceData({ current: inputPeriod });

    expect(actual.breakdowns.payers).toEqual([
      { payerType: 'GENERAL', visits: 0, invoices: 0, revenue: 0 },
      { payerType: 'BPJS', visits: 4, invoices: 3, revenue: 300_000 },
      { payerType: 'INSURANCE', visits: 0, invoices: 0, revenue: 0 },
      { payerType: null, visits: 2, invoices: 0, revenue: 0 },
    ]);
  });

  it('ages unpaid invoices into three buckets and totals them', () => {
    const inputPeriod = buildPeriod({
      outstanding: [
        { bucket: '8-30', invoices: 2, amountCents: 3_000_000 },
        { bucket: 'over-30', invoices: 1, amountCents: 1_000_000 },
      ],
    });

    const actual = buildAnalyticsFinanceData({ current: inputPeriod });

    expect(actual.breakdowns.outstanding).toEqual({
      invoices: 3,
      amount: 40_000,
      aging: [
        { bucket: '0-7', invoices: 0, amount: 0 },
        { bucket: '8-30', invoices: 2, amount: 30_000 },
        { bucket: 'over-30', invoices: 1, amount: 10_000 },
      ],
    });
  });

  it('adds the comparison period only when asked', () => {
    const current = buildPeriod({});

    const withoutComparison = buildAnalyticsFinanceData({ current });
    const withComparison = buildAnalyticsFinanceData({
      current,
      comparison: {
        ...buildPeriod({}),
        range: { ...SEPTEMBER, from: '2026-08-29', to: '2026-08-31' },
      },
    });

    expect(withoutComparison.comparison).toBeUndefined();
    expect(withComparison.comparison).toMatchObject({ from: '2026-08-29', to: '2026-08-31' });
  });
});
