import { SatusehatSubmissionResourceRecord } from '@hms/shared-types';
import { NotFoundException } from '@nestjs/common';

import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SATUSEHAT_READ_BACK_FIXTURES } from '../fixtures/satusehat-read-back-fixtures';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionDetailService } from './satusehat-submission-detail.service';

describe('SatusehatSubmissionDetailService', () => {
  const submissionRepositoryMock = {
    findSubmissionById: jest.fn(),
    findSubmissionResources: jest.fn(),
  };
  const httpClientMock = {
    sendRequest: jest.fn(),
  };

  const submissionId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

  function buildSubmissionRow() {
    return {
      id: submissionId,
      kind: 'ENCOUNTER' as const,
      encounterId: 'encounter-1',
      labOrderId: null,
      labOrderNumber: null,
      status: 'SUBMITTED' as const,
      attempts: 1,
      lastError: null,
      nextAttemptAt: new Date('2026-07-28T02:25:00.000Z'),
      lastAttemptAt: new Date('2026-07-28T02:25:04.000Z'),
      submittedAt: new Date('2026-07-28T02:25:04.000Z'),
      satusehatEncounterId: 'ihs-enc-1',
      createdAt: new Date('2026-07-28T02:20:00.000Z'),
      updatedAt: new Date('2026-07-28T02:25:04.000Z'),
    };
  }

  function buildRecord(
    overrides: Partial<SatusehatSubmissionResourceRecord> = {},
  ): SatusehatSubmissionResourceRecord {
    return {
      resourceType: 'Condition',
      outcome: 'SENT',
      skipReason: null,
      satusehatId: 'ihs-cond-1',
      localRecordId: null,
      isBackfilled: false,
      ...overrides,
    };
  }

  function buildService(): SatusehatSubmissionDetailService {
    return new SatusehatSubmissionDetailService(
      submissionRepositoryMock as unknown as SatusehatSubmissionRepository,
      httpClientMock as unknown as SatusehatHttpClient,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    submissionRepositoryMock.findSubmissionById.mockResolvedValue(buildSubmissionRow());
  });

  describe('getSubmissionDetail', () => {
    it('groups the list by resource type with ids and skip counts', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ resourceType: 'Encounter', satusehatId: 'ihs-enc-1' }),
        buildRecord({ satusehatId: 'ihs-cond-1' }),
        buildRecord({ satusehatId: 'ihs-cond-2' }),
        buildRecord({
          resourceType: 'Medication',
          outcome: 'SKIPPED',
          skipReason: 'NO_KFA_CODE',
          satusehatId: null,
        }),
        buildRecord({
          resourceType: 'Medication',
          outcome: 'SKIPPED',
          skipReason: 'NO_KFA_CODE',
          satusehatId: null,
        }),
      ]);

      const actual = await buildService().getSubmissionDetail(submissionId);

      expect(actual.hasResourceList).toBe(true);
      expect(actual.isBackfilled).toBe(false);
      expect(actual.resources).toEqual([
        {
          resourceType: 'Encounter',
          sentCount: 1,
          satusehatIds: ['ihs-enc-1'],
          unpairedCount: 0,
          skipped: [],
        },
        {
          resourceType: 'Condition',
          sentCount: 2,
          satusehatIds: ['ihs-cond-1', 'ihs-cond-2'],
          unpairedCount: 0,
          skipped: [],
        },
        {
          resourceType: 'Medication',
          sentCount: 0,
          satusehatIds: [],
          unpairedCount: 0,
          skipped: [{ reason: 'NO_KFA_CODE', count: 2 }],
        },
      ]);
    });

    it('counts a sent resource whose id was never resolved as unpaired', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ satusehatId: null }),
        buildRecord({ satusehatId: 'ihs-cond-2' }),
      ]);

      const actual = await buildService().getSubmissionDetail(submissionId);

      expect(actual.resources[0]).toMatchObject({
        sentCount: 2,
        satusehatIds: ['ihs-cond-2'],
        unpairedCount: 1,
      });
    });

    /**
     * The distinction the monitor has to draw: a submission that sent nothing
     * and a submission that predates the list both have zero rows, and only one
     * of them needs the P21-T05 backfill.
     */
    it('says a submission has no list at all rather than showing an empty success', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([]);

      const actual = await buildService().getSubmissionDetail(submissionId);

      expect(actual.hasResourceList).toBe(false);
      expect(actual.resources).toEqual([]);
    });

    it('flags a backfilled list, whose skips cannot be known', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ isBackfilled: true }),
      ]);

      const actual = await buildService().getSubmissionDetail(submissionId);

      expect(actual.isBackfilled).toBe(true);
    });

    it('404s for a submission that does not exist', async () => {
      submissionRepositoryMock.findSubmissionById.mockResolvedValue(null);

      await expect(buildService().getSubmissionDetail(submissionId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkSubmission', () => {
    it('reports a found resource with its version and nothing clinical', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ resourceType: 'Encounter', satusehatId: 'ihs-enc-1' }),
      ]);
      httpClientMock.sendRequest.mockResolvedValue(SATUSEHAT_READ_BACK_FIXTURES.Encounter);

      const actual = await buildService().checkSubmission(submissionId);

      expect(actual.results).toEqual([
        {
          resourceType: 'Encounter',
          satusehatId: 'ihs-enc-1',
          outcome: 'FOUND',
          versionId: SATUSEHAT_READ_BACK_FIXTURES.Encounter.meta.versionId,
          lastUpdated: SATUSEHAT_READ_BACK_FIXTURES.Encounter.meta.lastUpdated,
          status: 'finished',
          errorCode: null,
        },
      ]);
      expect(JSON.stringify(actual)).not.toContain(
        SATUSEHAT_READ_BACK_FIXTURES.Encounter.subject.display,
      );
    });

    it('reads a resource by its recorded type and id', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ resourceType: 'Condition', satusehatId: 'ihs-cond-9' }),
      ]);
      httpClientMock.sendRequest.mockResolvedValue(SATUSEHAT_READ_BACK_FIXTURES.Condition);

      await buildService().checkSubmission(submissionId);

      expect(httpClientMock.sendRequest).toHaveBeenCalledWith({
        method: 'GET',
        path: '/Condition/ihs-cond-9',
      });
    });

    /**
     * Keyed on the HTTP status, never the body: the platform's 404
     * `OperationOutcome` says `code: "no-store"` and
     * `details.text: "storage_error"` (P21-T01).
     */
    it('reports a resource the platform no longer holds as not found, not an error', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([buildRecord()]);
      httpClientMock.sendRequest.mockRejectedValue(
        new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'resource not found', 404),
      );

      const actual = await buildService().checkSubmission(submissionId);

      expect(actual.results[0]).toMatchObject({ outcome: 'NOT_FOUND', errorCode: null });
    });

    it('keeps "could not ask" distinct from "not held"', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([buildRecord()]);
      httpClientMock.sendRequest.mockRejectedValue(
        new SatusehatError('SATUSEHAT_TIMEOUT', 'timed out'),
      );

      const actual = await buildService().checkSubmission(submissionId);

      expect(actual.results[0]).toMatchObject({
        outcome: 'ERROR',
        errorCode: 'SATUSEHAT_TIMEOUT',
      });
    });

    it('one failed read does not fail the whole check', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ satusehatId: 'ihs-cond-1' }),
        buildRecord({ satusehatId: 'ihs-cond-2' }),
      ]);
      httpClientMock.sendRequest
        .mockRejectedValueOnce(new SatusehatError('SATUSEHAT_UNAVAILABLE', 'boom', 503))
        .mockResolvedValueOnce(SATUSEHAT_READ_BACK_FIXTURES.Condition);

      const actual = await buildService().checkSubmission(submissionId);

      expect(actual.results.map((row) => row.outcome)).toEqual(['ERROR', 'FOUND']);
    });

    it('never asks about a sent resource whose id was never resolved', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({ satusehatId: null }),
      ]);

      const actual = await buildService().checkSubmission(submissionId);

      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
      expect(actual.results[0]).toMatchObject({ outcome: 'UNPAIRED', satusehatId: '' });
    });

    it('never asks about a skipped item, which was never sent', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue([
        buildRecord({
          resourceType: 'Medication',
          outcome: 'SKIPPED',
          skipReason: 'NO_KFA_CODE',
          satusehatId: null,
        }),
      ]);

      const actual = await buildService().checkSubmission(submissionId);

      expect(httpClientMock.sendRequest).not.toHaveBeenCalled();
      expect(actual.results).toEqual([]);
    });

    it('caps how many reads are in flight at once', async () => {
      submissionRepositoryMock.findSubmissionResources.mockResolvedValue(
        Array.from({ length: 20 }, (_, index) => buildRecord({ satusehatId: `ihs-cond-${index}` })),
      );
      let inFlight = 0;
      let peakInFlight = 0;
      httpClientMock.sendRequest.mockImplementation(async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return SATUSEHAT_READ_BACK_FIXTURES.Condition;
      });

      const actual = await buildService().checkSubmission(submissionId);

      expect(actual.results).toHaveLength(20);
      expect(peakInFlight).toBeLessThanOrEqual(8);
    });
  });
});
