import { ConflictException, NotFoundException } from '@nestjs/common';

import { BpjsSubmissionRecord } from '@hms/shared-types';

import { BpjsSubmissionOpsService } from './bpjs-submission-ops.service';

describe('BpjsSubmissionOpsService', () => {
  const mockActor = { sub: 'actor-user', email: 'admin@example.com' };

  function buildRecord(overrides: Partial<BpjsSubmissionRecord> = {}): BpjsSubmissionRecord {
    return {
      id: 'submission-1',
      registrationId: 'registration-1',
      type: 'PENDAFTARAN',
      status: 'FAILED',
      attempts: 3,
      lastError: 'BPJS PCare upstream failure (HTTP 503)',
      nextAttemptAt: new Date('2026-08-05T02:00:00.000Z'),
      lastAttemptAt: new Date('2026-08-05T02:30:00.000Z'),
      submittedAt: null,
      bpjsReferenceNo: null,
      submittedKdPoli: null,
      createdAt: new Date('2026-08-05T01:00:00.000Z'),
      ...overrides,
    };
  }

  const submissionRepositoryMock = {
    findSubmissionPage: jest.fn(),
    findSubmissionById: jest.fn(),
    requeueSubmission: jest.fn(),
  };
  const submissionServiceMock = { processSubmission: jest.fn() };
  const auditServiceMock = { record: jest.fn() };

  function createService(): BpjsSubmissionOpsService {
    return new BpjsSubmissionOpsService(
      submissionRepositoryMock as never,
      submissionServiceMock as never,
      auditServiceMock as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists submissions as ISO views with pagination meta', async () => {
    submissionRepositoryMock.findSubmissionPage.mockResolvedValue({
      items: [buildRecord()],
      total: 11,
    });
    const service = createService();

    const actualResult = await service.listSubmissions({
      page: 2,
      limit: 10,
      status: 'FAILED',
      type: undefined,
      registrationId: undefined,
    });

    expect(submissionRepositoryMock.findSubmissionPage).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, status: 'FAILED' }),
    );
    expect(actualResult.items[0]).toMatchObject({
      id: 'submission-1',
      status: 'FAILED',
      nextAttemptAt: '2026-08-05T02:00:00.000Z',
    });
    expect(actualResult.meta).toEqual({ page: 2, limit: 10, total: 11 });
  });

  it('returns 404 for an unknown submission', async () => {
    submissionRepositoryMock.findSubmissionById.mockResolvedValue(null);
    const service = createService();

    await expect(service.retrySubmission('missing', mockActor as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 409 for SUBMITTED and PENDING rows', async () => {
    const service = createService();

    submissionRepositoryMock.findSubmissionById.mockResolvedValue(
      buildRecord({ status: 'SUBMITTED' }),
    );
    await expect(service.retrySubmission('submission-1', mockActor as never)).rejects.toThrow(
      ConflictException,
    );

    submissionRepositoryMock.findSubmissionById.mockResolvedValue(
      buildRecord({ status: 'PENDING' }),
    );
    await expect(service.retrySubmission('submission-1', mockActor as never)).rejects.toThrow(
      ConflictException,
    );
    expect(submissionRepositoryMock.requeueSubmission).not.toHaveBeenCalled();
  });

  it('requeues, audits, processes synchronously, and returns the settled view', async () => {
    const failedRecord = buildRecord();
    const requeuedRecord = buildRecord({ status: 'PENDING', attempts: 0 });
    const settledRecord = buildRecord({
      status: 'SUBMITTED',
      attempts: 1,
      bpjsReferenceNo: 'A12',
      submittedAt: new Date('2026-08-05T03:00:00.000Z'),
    });
    submissionRepositoryMock.findSubmissionById
      .mockResolvedValueOnce(failedRecord)
      .mockResolvedValueOnce(settledRecord);
    submissionRepositoryMock.requeueSubmission.mockResolvedValue(requeuedRecord);
    const service = createService();

    const actualView = await service.retrySubmission('submission-1', mockActor as never);

    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_SUBMISSION_RETRIED',
        resourceId: 'submission-1',
        metadata: {
          registrationId: 'registration-1',
          type: 'PENDAFTARAN',
          previousAttempts: 3,
        },
      }),
    );
    expect(submissionServiceMock.processSubmission).toHaveBeenCalledWith(requeuedRecord);
    expect(actualView).toMatchObject({ status: 'SUBMITTED', bpjsReferenceNo: 'A12' });
  });
});
