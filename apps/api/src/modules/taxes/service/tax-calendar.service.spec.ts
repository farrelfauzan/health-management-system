import { ConfigService } from '@nestjs/config';

import { ClinicianFeeStatementService } from '../../clinician-fee/service/clinician-fee-statement.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxReminderRepository } from '../repository/tax-reminder.repository';
import { TaxCalendarService } from './tax-calendar.service';

/**
 * P27-T10. The ticket's first acceptance criterion in full: on 10 October with
 * no October draft finalized, a reminder falls on 10 and 14 November — and
 * **not** after the draft is finalized.
 */
describe('TaxCalendarService (P27-T10)', () => {
  const taxReminderRepositoryMock = {
    claimNotice: jest.fn(),
    sumPaymentsInYear: jest.fn(),
    listFinalizedPeriods: jest.fn(),
  } as unknown as TaxReminderRepository;
  const taxProfileServiceMock = {
    getTaxSettings: jest.fn(),
  } as unknown as TaxProfileService;
  const clinicianFeeStatementServiceMock = {
    getPeriodSummary: jest.fn(),
  } as unknown as ClinicianFeeStatementService;

  function buildService(): TaxCalendarService {
    const configService = {
      get: jest.fn((key: string) => (key === 'CLINIC_TIMEZONE' ? 'Asia/Jakarta' : undefined)),
    } as unknown as ConfigService;
    return new TaxCalendarService(
      taxReminderRepositoryMock,
      taxProfileServiceMock,
      clinicianFeeStatementServiceMock,
      configService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // No jasa medis in any month: the PPh 21 dates stay calendar information
    // (P27-T07) and this spec keeps testing the PP 55 reminder alone.
    (clinicianFeeStatementServiceMock.getPeriodSummary as jest.Mock).mockImplementation(
      (period: string) =>
        Promise.resolve({
          period,
          clinicians: [],
          totals: { entryCount: 0, lineAmount: 0, grossFee: 0, clinicShare: 0 },
        }),
    );
    (taxProfileServiceMock.getTaxSettings as jest.Mock).mockResolvedValue({
      taxpayerType: 'PT',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2026,
      isPkp: false,
      pkpSince: null,
      nitku: null,
      updatedById: null,
      updatedAt: null,
    });
    (taxReminderRepositoryMock.listFinalizedPeriods as jest.Mock).mockResolvedValue([]);
    (taxReminderRepositoryMock.sumPaymentsInYear as jest.Mock).mockResolvedValue(0);
  });

  it('reminds five days before the November due date for the October period', async () => {
    // 10 November, clinic time. The October PP 55 deposit is due on the 15th.
    const actual = await buildService().findDueReminders(new Date('2026-11-09T18:00:00.000Z'));

    expect(actual).toEqual([
      {
        obligation: 'PP55_INCOME_TAX_DEPOSIT',
        period: '2026-10',
        dueDate: '2026-11-15',
        leadDays: 5,
      },
    ]);
  });

  it('reminds again one day before', async () => {
    const actual = await buildService().findDueReminders(new Date('2026-11-13T18:00:00.000Z'));

    expect(actual.map((reminder) => reminder.leadDays)).toEqual([1]);
  });

  it('says nothing once the draft is finalized', async () => {
    (taxReminderRepositoryMock.listFinalizedPeriods as jest.Mock).mockImplementation(
      (periods: string[], kind: string) =>
        Promise.resolve(kind === 'PP55_OMZET' ? periods.filter((p) => p === '2026-10') : []),
    );

    const actual = await buildService().findDueReminders(new Date('2026-11-09T18:00:00.000Z'));

    // The clinic has done the thing the reminder exists to ask for. Chasing
    // it anyway is the noise that teaches people to ignore the channel.
    expect(actual).toEqual([]);
  });

  it('says nothing on a day that is neither five nor one day out', async () => {
    const actual = await buildService().findDueReminders(new Date('2026-11-11T18:00:00.000Z'));

    expect(actual).toEqual([]);
  });

  it('never mentions PPN to a clinic that is not a PKP', async () => {
    // The PPN deposit for October would fall due on 30 November; five days
    // before is the 25th.
    const actual = await buildService().findDueReminders(new Date('2026-11-24T18:00:00.000Z'));

    expect(actual).toEqual([]);
  });

  it('reads turnover for the clinic-local calendar year', async () => {
    (taxReminderRepositoryMock.sumPaymentsInYear as jest.Mock).mockResolvedValue(3_840_000_000);

    const actual = await buildService().findTurnoverWarnings(new Date('2026-11-09T18:00:00.000Z'));

    expect(actual).toEqual({ year: 2026, turnoverRupiah: 3_840_000_000, fractions: [0.8] });
    const [range] = (taxReminderRepositoryMock.sumPaymentsInYear as jest.Mock).mock.calls[0] as [
      { start: Date; end: Date },
    ];
    // Midnight in Jakarta, not in UTC: a payment taken at 06:00 on 1 January
    // belongs to the new year, and UTC midnight would put it in the old one.
    expect(range.start.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  describe('the last PP 55 year', () => {
    it('warns from October of the last eligible year', async () => {
      const service = buildService();

      // A PT starting in 2026 has three tax years: 2026, 2027, 2028.
      await expect(
        service.findPp55LastYearWarning(new Date('2028-10-01T02:00:00.000Z')),
      ).resolves.toBe(2028);
      await expect(
        service.findPp55LastYearWarning(new Date('2028-09-30T02:00:00.000Z')),
      ).resolves.toBeNull();
    });

    it('never warns a taxpayer whose entitlement does not end', async () => {
      (taxProfileServiceMock.getTaxSettings as jest.Mock).mockResolvedValue({
        taxpayerType: 'INDIVIDUAL',
        incomeTaxRegime: 'PP55_FINAL',
        pp55StartYear: 2018,
        isPkp: false,
        pkpSince: null,
        nitku: null,
        updatedById: null,
        updatedAt: null,
      });

      await expect(
        buildService().findPp55LastYearWarning(new Date('2031-10-01T02:00:00.000Z')),
      ).resolves.toBeNull();
    });

    it('never warns a clinic that is not on PP 55 at all', async () => {
      (taxProfileServiceMock.getTaxSettings as jest.Mock).mockResolvedValue({
        taxpayerType: 'PT',
        incomeTaxRegime: 'GENERAL',
        pp55StartYear: null,
        isPkp: true,
        pkpSince: null,
        nitku: null,
        updatedById: null,
        updatedAt: null,
      });

      await expect(
        buildService().findPp55LastYearWarning(new Date('2028-10-01T02:00:00.000Z')),
      ).resolves.toBeNull();
    });
  });
});
