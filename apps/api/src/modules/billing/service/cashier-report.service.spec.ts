import { ConfigService } from '@nestjs/config';

import { CashierDailyReportQueryDto } from '../dto/cashier-daily-report-query.dto';
import { BillingRepository } from '../repository/billing.repository';
import { CashierReportService } from './cashier-report.service';

describe('CashierReportService', () => {
  const billingRepositoryMock = {
    findPaymentsForCashierReport: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn().mockReturnValue('Asia/Jakarta'),
  };

  const service = new CashierReportService(
    billingRepositoryMock as unknown as BillingRepository,
    configServiceMock as unknown as ConfigService,
  );

  const doctorBudi = { id: '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11', fullName: 'Dr. Budi Santoso' };
  const doctorSari = { id: '9d2a3b4c-5e6f-4a7b-8c9d-0e1f2a3b4c5d', fullName: 'Dr. Sari Dewi' };

  beforeEach(() => {
    jest.clearAllMocks();
    billingRepositoryMock.findPaymentsForCashierReport.mockResolvedValue([]);
  });

  it('bounds the requested clinic day by Jakarta-local midnights in UTC', async () => {
    await service.getDailyReport({ date: '2026-07-28' } as CashierDailyReportQueryDto);

    const range = billingRepositoryMock.findPaymentsForCashierReport.mock.calls[0][0];
    expect(range.startInclusive.toISOString()).toBe('2026-07-27T17:00:00.000Z');
    expect(range.endExclusive.toISOString()).toBe('2026-07-28T17:00:00.000Z');
  });

  it('totals the day by method and by doctor in exact rupiah', async () => {
    billingRepositoryMock.findPaymentsForCashierReport.mockResolvedValue([
      { method: 'CASH', amount: 50000.1, doctor: doctorBudi },
      { method: 'CASH', amount: 50000.2, doctor: doctorSari },
      { method: 'QRIS', amount: 125000, doctor: doctorBudi },
    ]);

    const actualReport = await service.getDailyReport({
      date: '2026-07-28',
    } as CashierDailyReportQueryDto);

    expect(actualReport.totals).toEqual({ count: 3, totalAmount: 225000.3 });
    expect(actualReport.byMethod).toEqual([
      { method: 'QRIS', count: 1, totalAmount: 125000 },
      { method: 'CASH', count: 2, totalAmount: 100000.3 },
    ]);
    expect(actualReport.byDoctor).toEqual([
      {
        doctorId: doctorBudi.id,
        doctorName: doctorBudi.fullName,
        count: 2,
        totalAmount: 175000.1,
      },
      {
        doctorId: doctorSari.id,
        doctorName: doctorSari.fullName,
        count: 1,
        totalAmount: 50000.2,
      },
    ]);
  });

  it('returns an explicit empty report for a day with no payments', async () => {
    const actualReport = await service.getDailyReport({
      date: '2026-07-28',
    } as CashierDailyReportQueryDto);

    expect(actualReport).toEqual({
      date: '2026-07-28',
      totals: { count: 0, totalAmount: 0 },
      byMethod: [],
      byDoctor: [],
    });
  });

  it('defaults to the clinic-local today when no date is given', async () => {
    const actualReport = await service.getDailyReport({} as CashierDailyReportQueryDto);

    expect(actualReport.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(billingRepositoryMock.findPaymentsForCashierReport).toHaveBeenCalled();
  });
});
