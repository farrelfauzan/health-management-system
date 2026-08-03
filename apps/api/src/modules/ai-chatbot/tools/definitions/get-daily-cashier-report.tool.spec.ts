import { CurrentUser } from '../../../../common/auth/current-user.type';
import { CashierReportService } from '../../../billing/service/cashier-report.service';
import { GetDailyCashierReportTool } from './get-daily-cashier-report.tool';

describe('GetDailyCashierReportTool', () => {
  const mockUser: CurrentUser = { sub: 'admin-user-1', email: 'admin@clinic.local' };

  function buildReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      date: '2026-08-03',
      totals: { count: 31, totalAmount: 4_250_000 },
      byMethod: [
        { method: 'CASH', count: 20, totalAmount: 2_500_000 },
        { method: 'TRANSFER', count: 11, totalAmount: 1_750_000 },
      ],
      byDoctor: [{ doctorId: 'doctor-1', doctorName: 'dr. Siti Rahayu', count: 18, totalAmount: 3_100_000 }],
      ...overrides,
    };
  }

  function buildTool(getDailyReport: jest.Mock): GetDailyCashierReportTool {
    return new GetDailyCashierReportTool({
      getDailyReport,
    } as unknown as CashierReportService);
  }

  it('is an admin-channel tool requiring invoice.read:any', () => {
    const actualTool = buildTool(jest.fn());

    // The backing service resolves no scope of its own, so this declaration
    // *is* the REST route's `@Auth([{ action: 'read', subject: 'Invoice' }])`
    // reproduced — the tool is still the same door.
    expect(actualTool.requiredPermission).toEqual({
      resource: 'Invoice',
      action: 'read',
      scope: 'ANY',
    });
    expect(actualTool.channels).toEqual(['ADMIN']);
  });

  it('flattens the totals and keeps both breakdowns', async () => {
    const mockGetDailyReport = jest.fn().mockResolvedValue(buildReport());

    const actualResult = await buildTool(mockGetDailyReport).execute(mockUser, {});

    expect(actualResult).toEqual({
      date: '2026-08-03',
      paymentCount: 31,
      totalAmount: 4_250_000,
      byMethod: [
        { method: 'CASH', count: 20, totalAmount: 2_500_000 },
        { method: 'TRANSFER', count: 11, totalAmount: 1_750_000 },
      ],
      byDoctor: [{ doctorName: 'dr. Siti Rahayu', count: 18, totalAmount: 3_100_000 }],
    });
  });

  it('keeps the doctor name deliberately and drops the doctor id', async () => {
    // The one admin-channel field that is not free, shipped on purpose: a
    // revenue-by-doctor question is the point of the report, and the name is
    // staff data rather than patient data. The id adds nothing.
    const mockGetDailyReport = jest.fn().mockResolvedValue(buildReport());

    const actualResult = await buildTool(mockGetDailyReport).execute(mockUser, {});

    expect(JSON.stringify(actualResult)).toContain('dr. Siti Rahayu');
    expect(JSON.stringify(actualResult)).not.toContain('doctor-1');
  });

  it('cannot leak a patient field a future edit adds to the report', async () => {
    const mockGetDailyReport = jest.fn().mockResolvedValue(
      buildReport({
        byPatient: [{ patientName: 'Budi Santoso', totalAmount: 250_000 }],
        largestInvoicePatient: 'Ani Lestari',
      }),
    );

    const actualResult = await buildTool(mockGetDailyReport).execute(mockUser, {});

    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('Budi Santoso');
    expect(serialized).not.toContain('Ani Lestari');
  });

  it('leaves "today" to the service and passes an explicit date through', async () => {
    const mockGetDailyReport = jest.fn().mockResolvedValue(buildReport());
    const tool = buildTool(mockGetDailyReport);

    await tool.execute(mockUser, {});
    await tool.execute(mockUser, { date: '2026-08-01' });

    expect(mockGetDailyReport).toHaveBeenNthCalledWith(1, {});
    expect(mockGetDailyReport).toHaveBeenNthCalledWith(2, { date: '2026-08-01' });
  });
});
