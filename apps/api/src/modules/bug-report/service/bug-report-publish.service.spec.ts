import { BugReportPublishRecord } from '@hms/shared-types';

import { NotionError } from '../../../common/notion/notion.error';
import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { AuditService } from '../../../common/audit/audit.service';
import { NotificationService } from '../../notification/service/notification.service';
import { BugReportPublishConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { BugReportPublishService } from './bug-report-publish.service';

function buildReport(overrides: Partial<BugReportPublishRecord> = {}): BugReportPublishRecord {
  return {
    id: 'report-1',
    reference: 'BR-000042',
    reporterRole: 'DOCTOR',
    triage: {
      title: 'Hasil lab tidak muncul',
      summary: 'Daftar hasil lab kosong.',
      stepsToReproduce: ['Buka daftar lab'],
      expected: 'Hasil tampil',
      actual: 'Layar kosong',
      severity: 'P1',
      type: 'Bug',
      module: 'Laboratory',
      mayContainPersonalData: false,
    },
    triagedBy: 'AI',
    redactedText: null,
    pagePath: '/admin/laboratory',
    requestIds: ['req-1'],
    appVersion: '1.4.2',
    attemptCount: 0,
    notionPageId: null,
    createdAt: new Date('2026-09-12T08:00:00.000Z'),
    ...overrides,
  };
}

function buildConfig(overrides: Partial<BugReportPublishConfig> = {}): BugReportPublishConfig {
  return {
    clinicLabel: 'Klinik Sehat',
    workerEnabled: true,
    workerPollIntervalMs: 20_000,
    workerBatchSize: 3,
    leaseMs: 120_000,
    maxAttempts: 3,
    retryBaseDelayMs: 1_000,
    publishedTextRetentionDays: 30,
    heldTextRetentionDays: 7,
    ...overrides,
  };
}

describe('BugReportPublishService', () => {
  const createPageMock = jest.fn();
  const queryDataSourceMock = jest.fn();
  const markPublishedMock = jest.fn();
  const markFailedMock = jest.fn();
  const rescheduleAttemptMock = jest.fn();
  const createForUsersWithPermissionMock = jest.fn();
  const recordMock = jest.fn();

  function buildService(config: BugReportPublishConfig = buildConfig()): BugReportPublishService {
    return new BugReportPublishService(
      config,
      {
        markPublished: markPublishedMock,
        markFailed: markFailedMock,
        rescheduleAttempt: rescheduleAttemptMock,
      } as unknown as BugReportRepository,
      {
        createPage: createPageMock,
        queryDataSource: queryDataSourceMock,
      } as unknown as NotionHttpClient,
      {
        createForUsersWithPermission: createForUsersWithPermissionMock,
      } as unknown as NotificationService,
      { record: recordMock } as unknown as AuditService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the page and records where it landed', async () => {
    createPageMock.mockResolvedValueOnce({ id: 'page-1', url: 'https://notion.so/page-1' });

    await buildService().processReport(buildReport());

    expect(markPublishedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-1',
        notionPageId: 'page-1',
        notionPageUrl: 'https://notion.so/page-1',
      }),
    );
  });

  /**
   * A first attempt cannot have created anything, so spending a query to prove it
   * would double the request count against a ~3/s rate limit for no information.
   */
  it('does not look for an existing page on a first attempt', async () => {
    createPageMock.mockResolvedValueOnce({ id: 'page-1' });

    await buildService().processReport(buildReport({ attemptCount: 0 }));

    expect(queryDataSourceMock).not.toHaveBeenCalled();
  });

  /**
   * The acceptance criterion: Notion timed out *after* actually creating the
   * page. The retry must find it by Report ID and adopt it, so the board holds
   * exactly one ticket — page creation is not idempotent, and a blind retry is
   * how one report becomes two.
   */
  it('adopts the existing page after an ambiguous failure instead of creating a second', async () => {
    queryDataSourceMock.mockResolvedValueOnce({
      results: [{ id: 'page-existing', url: 'https://notion.so/page-existing' }],
    });

    await buildService().processReport(buildReport({ attemptCount: 1 }));

    expect(createPageMock).not.toHaveBeenCalled();
    expect(queryDataSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { property: 'Report ID', rich_text: { equals: 'BR-000042' } },
      }),
    );
    expect(markPublishedMock).toHaveBeenCalledWith(
      expect.objectContaining({ notionPageId: 'page-existing' }),
    );
  });

  it('creates the page when the retry lookup finds nothing', async () => {
    queryDataSourceMock.mockResolvedValueOnce({ results: [] });
    createPageMock.mockResolvedValueOnce({ id: 'page-2' });

    await buildService().processReport(buildReport({ attemptCount: 1 }));

    expect(createPageMock).toHaveBeenCalledTimes(1);
    expect(markPublishedMock).toHaveBeenCalledWith(
      expect.objectContaining({ notionPageId: 'page-2' }),
    );
  });

  /**
   * A failed lookup must not become a failed publish. The caller is about to try
   * a create that will fail the same way if Notion is genuinely unreachable; the
   * cost of guessing wrong here is a duplicate ticket, and the cost of guessing
   * wrong the other way is a report that never publishes at all.
   */
  it('goes on to create when the lookup itself fails', async () => {
    queryDataSourceMock.mockRejectedValueOnce(new NotionError('RETRYABLE', 'unreachable'));
    createPageMock.mockResolvedValueOnce({ id: 'page-3' });

    await buildService().processReport(buildReport({ attemptCount: 1 }));

    expect(markPublishedMock).toHaveBeenCalledWith(
      expect.objectContaining({ notionPageId: 'page-3' }),
    );
  });

  /**
   * The second acceptance criterion: the integration was unshared from the board.
   * That is permanent, so retrying is pointless, and it is silent — nobody sees
   * the board stop filling — so somebody who can fix it has to be told.
   */
  it('fails permanently and notifies the connector managers on a rejected request', async () => {
    createPageMock.mockRejectedValueOnce(
      new NotionError('PERMANENT', 'Notion rejected the request (HTTP 400)', {
        notionCode: 'object_not_found',
        statusCode: 400,
      }),
    );

    await buildService().processReport(buildReport());

    expect(markFailedMock).toHaveBeenCalledWith({ id: 'report-1', error: 'object_not_found' });
    expect(rescheduleAttemptMock).not.toHaveBeenCalled();
    expect(createForUsersWithPermissionMock).toHaveBeenCalledWith(
      'notion-connector.manage:any',
      expect.objectContaining({
        type: 'BUG_REPORT_PUBLISH_FAILED',
        params: { reference: 'BR-000042', reason: 'object_not_found' },
      }),
    );
  });

  it('records only the error code, never an upstream message', async () => {
    createPageMock.mockRejectedValueOnce(
      new NotionError('PERMANENT', 'body.properties.Title is expected to be title', {
        notionCode: 'validation_error',
      }),
    );

    await buildService().processReport(buildReport());

    expect(markFailedMock).toHaveBeenCalledWith({ id: 'report-1', error: 'validation_error' });
  });

  it('backs off on a retryable failure while attempts remain', async () => {
    createPageMock.mockRejectedValueOnce(new NotionError('RETRYABLE', 'rate limited'));

    await buildService().processReport(buildReport());

    expect(rescheduleAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'report-1', nextAttemptAt: expect.any(Date) }),
    );
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  /**
   * Notion is the only party that knows how long it wants to be left alone, so
   * its `Retry-After` wins whenever it exceeds our own backoff. Going back early
   * against a rate limit is how a limit becomes a block.
   */
  it('honours a Retry-After longer than the computed backoff', async () => {
    createPageMock.mockRejectedValueOnce(
      new NotionError('RETRYABLE', 'rate limited', { retryAfterMs: 600_000 }),
    );

    await buildService().processReport(buildReport());

    const scheduledAt = rescheduleAttemptMock.mock.calls[0]?.[0].nextAttemptAt as Date;
    expect(scheduledAt.getTime() - Date.now()).toBeGreaterThan(500_000);
  });

  it('fails once the attempts run out', async () => {
    createPageMock.mockRejectedValueOnce(new NotionError('RETRYABLE', 'rate limited'));

    await buildService(buildConfig({ maxAttempts: 2 })).processReport(
      buildReport({ attemptCount: 1 }),
    );

    expect(markFailedMock).toHaveBeenCalled();
  });

  it('publishes a fallback ticket carrying the reporter redacted words', async () => {
    createPageMock.mockResolvedValueOnce({ id: 'page-4' });

    await buildService().processReport(
      buildReport({ triage: null, triagedBy: 'FALLBACK', redactedText: 'Layar lab kosong.' }),
    );

    const [{ children }] = createPageMock.mock.calls[0];
    expect(JSON.stringify(children)).toContain('Layar lab kosong.');
    expect(JSON.stringify(children)).toContain('AI triage was unavailable');
  });
});
