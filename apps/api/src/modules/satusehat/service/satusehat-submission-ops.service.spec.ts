import { SatusehatSubmissionRecord } from '@hms/shared-types';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionOpsService } from './satusehat-submission-ops.service';
import { SatusehatSubmissionService } from './satusehat-submission.service';

describe('SatusehatSubmissionOpsService', () => {
  const submissionRepositoryMock = {
    findSubmissionById: jest.fn(),
    findSubmissionPage: jest.fn(),
    requeueSubmission: jest.fn(),
  };
  const submissionServiceMock = {
    processSubmission: jest.fn(),
  };
  const auditServiceMock = {
    record: jest.fn(),
  };
  const currentUser: CurrentUser = { sub: 'admin-user', email: 'admin@hms.local' };

  const failedRecord: SatusehatSubmissionRecord = {
    id: 'submission-1',
    encounterId: 'encounter-1',
    status: 'FAILED',
    attempts: 8,
    lastError: 'SATUSEHAT is unreachable (HTTP 503)',
    nextAttemptAt: new Date('2026-07-28T09:00:00.000Z'),
    lastAttemptAt: new Date('2026-07-28T08:00:00.000Z'),
    submittedAt: null,
    satusehatEncounterId: null,
    createdAt: new Date('2026-07-27T10:15:00.000Z'),
    updatedAt: new Date('2026-07-28T08:00:00.000Z'),
  };

  let service: SatusehatSubmissionOpsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SatusehatSubmissionOpsService(
      submissionRepositoryMock as unknown as SatusehatSubmissionRepository,
      submissionServiceMock as unknown as SatusehatSubmissionService,
      auditServiceMock as unknown as AuditService,
    );
  });

  describe('listSubmissions', () => {
    it('maps records to ISO-string views with pagination meta', async () => {
      submissionRepositoryMock.findSubmissionPage.mockResolvedValue({
        items: [failedRecord],
        total: 11,
      });

      const actualResult = await service.listSubmissions({
        page: 2,
        limit: 5,
        status: 'FAILED',
      });

      expect(submissionRepositoryMock.findSubmissionPage).toHaveBeenCalledWith({
        status: 'FAILED',
        encounterId: undefined,
        skip: 5,
        take: 5,
      });
      expect(actualResult.meta).toEqual({ page: 2, limit: 5, total: 11 });
      expect(actualResult.items[0]).toEqual({
        id: 'submission-1',
        encounterId: 'encounter-1',
        status: 'FAILED',
        attempts: 8,
        lastError: 'SATUSEHAT is unreachable (HTTP 503)',
        nextAttemptAt: '2026-07-28T09:00:00.000Z',
        lastAttemptAt: '2026-07-28T08:00:00.000Z',
        submittedAt: null,
        satusehatEncounterId: null,
        createdAt: '2026-07-27T10:15:00.000Z',
        updatedAt: '2026-07-28T08:00:00.000Z',
      });
    });
  });

  describe('retrySubmission', () => {
    it('throws 404 when the submission does not exist', async () => {
      submissionRepositoryMock.findSubmissionById.mockResolvedValue(null);

      await expect(service.retrySubmission('missing', currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(submissionRepositoryMock.requeueSubmission).not.toHaveBeenCalled();
    });

    it('rejects a SUBMITTED row with 409', async () => {
      submissionRepositoryMock.findSubmissionById.mockResolvedValue({
        ...failedRecord,
        status: 'SUBMITTED',
      });

      await expect(service.retrySubmission('submission-1', currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(submissionRepositoryMock.requeueSubmission).not.toHaveBeenCalled();
    });

    it('rejects a PENDING row with 409', async () => {
      submissionRepositoryMock.findSubmissionById.mockResolvedValue({
        ...failedRecord,
        status: 'PENDING',
      });

      await expect(service.retrySubmission('submission-1', currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(submissionServiceMock.processSubmission).not.toHaveBeenCalled();
    });

    it('requeues a FAILED row, audits the actor, processes it, and returns the settled view', async () => {
      const requeuedRecord: SatusehatSubmissionRecord = {
        ...failedRecord,
        status: 'PENDING',
        attempts: 0,
      };
      const settledRecord: SatusehatSubmissionRecord = {
        ...failedRecord,
        status: 'SUBMITTED',
        attempts: 1,
        lastError: null,
        submittedAt: new Date('2026-07-28T09:05:01.000Z'),
        satusehatEncounterId: 'ihs-encounter-1',
      };
      submissionRepositoryMock.findSubmissionById
        .mockResolvedValueOnce(failedRecord)
        .mockResolvedValueOnce(settledRecord);
      submissionRepositoryMock.requeueSubmission.mockResolvedValue(requeuedRecord);

      const actualResult = await service.retrySubmission('submission-1', currentUser);

      expect(submissionRepositoryMock.requeueSubmission).toHaveBeenCalledWith('submission-1');
      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'SATUSEHAT_SUBMISSION_RETRIED',
        resource: 'SatusehatSubmission',
        resourceId: 'submission-1',
        actorUserId: 'admin-user',
        metadata: { encounterId: 'encounter-1', previousAttempts: 8 },
      });
      expect(submissionServiceMock.processSubmission).toHaveBeenCalledWith(requeuedRecord);
      expect(actualResult.status).toBe('SUBMITTED');
      expect(actualResult.satusehatEncounterId).toBe('ihs-encounter-1');
      expect(actualResult.submittedAt).toBe('2026-07-28T09:05:01.000Z');
    });

    it('falls back to the requeued row when the settled re-read is missing', async () => {
      const requeuedRecord: SatusehatSubmissionRecord = {
        ...failedRecord,
        status: 'PENDING',
        attempts: 0,
      };
      submissionRepositoryMock.findSubmissionById
        .mockResolvedValueOnce(failedRecord)
        .mockResolvedValueOnce(null);
      submissionRepositoryMock.requeueSubmission.mockResolvedValue(requeuedRecord);

      const actualResult = await service.retrySubmission('submission-1', currentUser);

      expect(actualResult.status).toBe('PENDING');
      expect(actualResult.attempts).toBe(0);
    });
  });
});
