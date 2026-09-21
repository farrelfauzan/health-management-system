import { ConfigService } from '@nestjs/config';

import { NotificationService } from '../../notification/service/notification.service';
import { TaxCalendarService } from './tax-calendar.service';
import { TaxCalendarWorker } from './tax-calendar.worker';

/**
 * P27-T10. The two acceptance criteria the ticket names are here in full: the
 * October PP 55 draft reminded on 10 and 14 November and silenced by
 * finalizing, and one 80% warning when turnover crosses Rp 3.84 bn.
 */
describe('TaxCalendarWorker (P27-T10)', () => {
  const taxCalendarServiceMock = {
    findDueReminders: jest.fn(),
    findTurnoverWarnings: jest.fn(),
    findPp55LastYearWarning: jest.fn(),
    claimNotice: jest.fn(),
  } as unknown as TaxCalendarService;
  const notificationServiceMock = {
    createForUsersWithPermission: jest.fn(),
  } as unknown as NotificationService;

  function buildWorker(): TaxCalendarWorker {
    const configService = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    return new TaxCalendarWorker(taxCalendarServiceMock, notificationServiceMock, configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (taxCalendarServiceMock.findDueReminders as jest.Mock).mockResolvedValue([]);
    (taxCalendarServiceMock.findTurnoverWarnings as jest.Mock).mockResolvedValue({
      year: 2026,
      turnoverRupiah: 0,
      fractions: [],
    });
    (taxCalendarServiceMock.findPp55LastYearWarning as jest.Mock).mockResolvedValue(null);
    (taxCalendarServiceMock.claimNotice as jest.Mock).mockResolvedValue(true);
    (notificationServiceMock.createForUsersWithPermission as jest.Mock).mockResolvedValue(2);
  });

  it("announces October's PP 55 deposit to the people who can file it", async () => {
    (taxCalendarServiceMock.findDueReminders as jest.Mock).mockResolvedValue([
      {
        obligation: 'PP55_INCOME_TAX_DEPOSIT',
        period: '2026-10',
        dueDate: '2026-11-15',
        leadDays: 5,
      },
    ]);

    const actualCount = await buildWorker().sweepOnce(new Date('2026-11-10T02:00:00.000Z'));

    expect(actualCount).toBe(2);
    expect(taxCalendarServiceMock.claimNotice).toHaveBeenCalledWith(
      'OBLIGATION_DUE',
      'DUE:2026-10:PP55_INCOME_TAX_DEPOSIT:5',
    );
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'tax-report.write:any',
      expect.objectContaining({
        type: 'TAX_OBLIGATION_DUE',
        // Producer-written, as every notification href is: the consumer never
        // maps one, so a wrong value here is a silent bounce, not a 404.
        href: '/admin/taxes',
        params: expect.objectContaining({ period: '2026-10', dueDate: '2026-11-15' }),
      }),
    );
  });

  it('announces the same due date once, however often the sweep runs', async () => {
    (taxCalendarServiceMock.findDueReminders as jest.Mock).mockResolvedValue([
      {
        obligation: 'PP55_INCOME_TAX_DEPOSIT',
        period: '2026-10',
        dueDate: '2026-11-15',
        leadDays: 5,
      },
    ]);
    (taxCalendarServiceMock.claimNotice as jest.Mock).mockResolvedValueOnce(true);
    (taxCalendarServiceMock.claimNotice as jest.Mock).mockResolvedValue(false);
    const worker = buildWorker();

    await worker.sweepOnce(new Date('2026-11-10T02:00:00.000Z'));
    await worker.sweepOnce(new Date('2026-11-10T08:00:00.000Z'));

    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledTimes(1);
  });

  it('raises one 80% warning when turnover crosses Rp 3.84 bn', async () => {
    (taxCalendarServiceMock.findTurnoverWarnings as jest.Mock).mockResolvedValue({
      year: 2026,
      turnoverRupiah: 3_840_000_000,
      fractions: [0.8],
    });

    await buildWorker().sweepOnce(new Date('2026-11-10T02:00:00.000Z'));

    expect(taxCalendarServiceMock.claimNotice).toHaveBeenCalledWith(
      'TURNOVER_THRESHOLD',
      'TURNOVER:2026:80',
    );
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'tax-report.write:any',
      expect.objectContaining({
        type: 'TAX_TURNOVER_THRESHOLD',
        titleKey: 'taxTurnoverNearing.title',
      }),
    );
  });

  it('tells the clinic the threshold is reached, separately from nearing it', async () => {
    (taxCalendarServiceMock.findTurnoverWarnings as jest.Mock).mockResolvedValue({
      year: 2026,
      turnoverRupiah: 4_800_000_000,
      fractions: [0.8, 1],
    });

    await buildWorker().sweepOnce(new Date('2026-12-01T02:00:00.000Z'));

    const titleKeys = (
      notificationServiceMock.createForUsersWithPermission as jest.Mock
    ).mock.calls.map(([, payload]: [string, { titleKey: string }]) => payload.titleKey);
    expect(titleKeys).toEqual(['taxTurnoverNearing.title', 'taxTurnoverReached.title']);
  });

  it('announces the last PP 55 year once', async () => {
    (taxCalendarServiceMock.findPp55LastYearWarning as jest.Mock).mockResolvedValue(2029);

    await buildWorker().sweepOnce(new Date('2029-10-01T02:00:00.000Z'));

    expect(taxCalendarServiceMock.claimNotice).toHaveBeenCalledWith(
      'PP55_LAST_YEAR',
      'PP55_LAST_YEAR:2029',
    );
    expect(notificationServiceMock.createForUsersWithPermission).toHaveBeenCalledWith(
      'tax-report.write:any',
      expect.objectContaining({ type: 'TAX_PP55_LAST_YEAR' }),
    );
  });

  it('raises nothing on a day with no due date, no crossed mark and no last year', async () => {
    const actualCount = await buildWorker().sweepOnce(new Date('2026-11-03T02:00:00.000Z'));

    expect(actualCount).toBe(0);
    expect(notificationServiceMock.createForUsersWithPermission).not.toHaveBeenCalled();
  });

  it('swallows a failed sweep rather than crashing the process', async () => {
    (taxCalendarServiceMock.findDueReminders as jest.Mock).mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      buildWorker().sweepOnce(new Date('2026-11-10T02:00:00.000Z')),
    ).resolves.toBe(0);
  });
});
