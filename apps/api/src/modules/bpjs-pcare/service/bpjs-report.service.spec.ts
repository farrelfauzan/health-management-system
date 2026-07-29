import { BpjsReportService } from './bpjs-report.service';

describe('BpjsReportService', () => {
  const submissionRepositoryMock = { findMonthlyReconciliation: jest.fn() };

  function createService(): BpjsReportService {
    return new BpjsReportService(submissionRepositoryMock as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes the reconciliation to the calendar month and aggregates per type', async () => {
    submissionRepositoryMock.findMonthlyReconciliation.mockResolvedValue({
      counts: [
        { type: 'PENDAFTARAN', status: 'SUBMITTED', count: 40 },
        { type: 'PENDAFTARAN', status: 'FAILED', count: 2 },
        { type: 'KUNJUNGAN', status: 'SUBMITTED', count: 39 },
        { type: 'KUNJUNGAN', status: 'PENDING', count: 1 },
      ],
      failures: [
        {
          id: 'submission-1',
          registrationId: 'registration-1',
          type: 'PENDAFTARAN',
          status: 'FAILED',
          attempts: 1,
          lastError: 'no poli mapping',
          nextAttemptAt: new Date(),
          lastAttemptAt: new Date('2026-08-05T02:30:00.000Z'),
          submittedAt: null,
          bpjsReferenceNo: null,
          submittedKdPoli: null,
          createdAt: new Date(),
        },
      ],
    });
    const service = createService();

    const actualReport = await service.getMonthlyReport({ month: '2026-08' });

    expect(submissionRepositoryMock.findMonthlyReconciliation).toHaveBeenCalledWith(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(actualReport.month).toBe('2026-08');
    expect(actualReport.types).toContainEqual({
      type: 'PENDAFTARAN',
      recorded: 42,
      submitted: 40,
      pending: 0,
      failed: 2,
    });
    expect(actualReport.types).toContainEqual({
      type: 'KUNJUNGAN',
      recorded: 40,
      submitted: 39,
      pending: 1,
      failed: 0,
    });
    expect(actualReport.types).toContainEqual({
      type: 'OBAT',
      recorded: 0,
      submitted: 0,
      pending: 0,
      failed: 0,
    });
    expect(actualReport.failures).toEqual([
      {
        submissionId: 'submission-1',
        registrationId: 'registration-1',
        type: 'PENDAFTARAN',
        attempts: 1,
        lastError: 'no poli mapping',
        lastAttemptAt: '2026-08-05T02:30:00.000Z',
      },
    ]);
  });

  it('rolls a December month over into the next year', async () => {
    submissionRepositoryMock.findMonthlyReconciliation.mockResolvedValue({
      counts: [],
      failures: [],
    });
    const service = createService();

    await service.getMonthlyReport({ month: '2026-12' });

    expect(submissionRepositoryMock.findMonthlyReconciliation).toHaveBeenCalledWith(
      new Date('2026-12-01T00:00:00.000Z'),
      new Date('2027-01-01T00:00:00.000Z'),
    );
  });
});
