import { BadRequestException } from '@nestjs/common';
import type { AnalyticsFinanceData, AnalyticsResponse } from '@hms/shared-types';

import type { AuditService } from '../../../common/audit/audit.service';
import type { AnalyticsCaseMixService } from './analytics-case-mix.service';
import type { AnalyticsFinanceService } from './analytics-finance.service';
import type { AnalyticsOperationsService } from './analytics-operations.service';
import type { AnalyticsPharmacyService } from './analytics-pharmacy.service';
import type { AnalyticsReportingHealthService } from './analytics-reporting-health.service';
import { AnalyticsExportService } from './analytics-export.service';

const FINANCE_RESPONSE: AnalyticsResponse<AnalyticsFinanceData> = {
  data: {
    totals: {
      revenue: 4_250_000,
      taxAmount: 0,
      invoices: 3,
      invoicedVisits: 3,
      revenuePerVisit: 1_416_667,
      unpaidInvoices: 0,
      unpaidAmount: 0,
      cashReceived: 4_250_000,
      payments: 3,
      voidedInvoices: 0,
      voidedAmount: 0,
    },
    series: [{ bucket: '2026-09-15', revenue: 4_250_000, cashReceived: 4_250_000 }],
    breakdowns: {
      paymentMethods: [{ method: 'CASH', payments: 1, amount: 1_500_000 }],
      itemTypes: [],
      doctors: [],
      poli: [],
      payers: [],
      outstanding: { invoices: 0, amount: 0, aging: [] },
    },
  },
  meta: {
    from: '2026-09-15',
    to: '2026-09-15',
    timezone: 'Asia/Jakarta',
    granularity: 'day',
    generatedAt: '2026-09-30T02:00:00.000Z',
  },
};

describe('AnalyticsExportService', () => {
  function buildService() {
    const mockFinance = { getFinance: jest.fn(async () => FINANCE_RESPONSE) };
    const mockAudit = { recordOrThrow: jest.fn(async () => undefined) };
    const service = new AnalyticsExportService(
      {} as AnalyticsOperationsService,
      mockFinance as unknown as AnalyticsFinanceService,
      {} as AnalyticsCaseMixService,
      {} as AnalyticsPharmacyService,
      {} as AnalyticsReportingHealthService,
      mockAudit as unknown as AuditService,
    );
    return { service, mockFinance, mockAudit };
  }

  const QUERY = { from: '2026-09-15', to: '2026-09-15', compare: true, payerType: 'BPJS' as const };

  it('writes only the tables asked for, names the file, and reads without the comparison', async () => {
    const { service, mockFinance } = buildService();

    const actual = await service.exportDashboard({
      dashboard: 'finance',
      query: { ...QUERY, tables: ['payment-methods'] },
      actorUserId: 'admin-user',
    });

    expect(actual.fileName).toBe('metaklinik-finance-2026-09-15-2026-09-15.csv');
    expect(actual.csv).toContain(
      'Metode pembayaran (per tanggal bayar)\r\nMetode,Pembayaran,Nilai\r\nTunai,1,1500000',
    );
    expect(actual.csv).not.toContain('Ringkasan');
    expect(actual.rowCount).toBe(1);
    expect(mockFinance.getFinance).toHaveBeenCalledWith(
      expect.objectContaining({ compare: false, payerType: 'BPJS' }),
    );
  });

  it('records one EXPORT with the dashboard, the filters and the row count', async () => {
    const { service, mockAudit } = buildService();

    await service.exportDashboard({
      dashboard: 'finance',
      query: QUERY,
      actorUserId: 'admin-user',
    });

    expect(mockAudit.recordOrThrow).toHaveBeenCalledTimes(1);
    expect(mockAudit.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXPORT',
        resource: 'analytics',
        actorUserId: 'admin-user',
        metadata: expect.objectContaining({
          dashboard: 'finance',
          filters: expect.objectContaining({ from: '2026-09-15', payerType: 'BPJS' }),
          rowCount: expect.any(Number),
        }),
      }),
    );
  });

  it('refuses a table the dashboard does not have, and records nothing', async () => {
    const { service, mockAudit } = buildService();

    const actual = service.exportDashboard({
      dashboard: 'finance',
      query: { ...QUERY, tables: ['patients'] },
      actorUserId: 'admin-user',
    });

    await expect(actual).rejects.toBeInstanceOf(BadRequestException);
    expect(mockAudit.recordOrThrow).not.toHaveBeenCalled();
  });
});
