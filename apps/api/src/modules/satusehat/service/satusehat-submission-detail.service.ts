import {
  SatusehatResourceCheckResult,
  SatusehatSubmissionCheckView,
  SatusehatSubmissionDetailView,
  SatusehatSubmissionResourceGroup,
  SatusehatSubmissionResourceRecord,
  SatusehatSubmissionSkipGroup,
} from '@hms/shared-types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { SatusehatHttpClient } from '../../../common/satusehat/satusehat-http.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { projectCheckedResource } from './project-checked-resource';

/**
 * How many resources are read back at once. P21-T01 measured ~200 ms per read
 * and saw no rate limiting at twelve concurrent, so eight finishes a full
 * encounter (~20 resources) in about three rounds while leaving headroom on a
 * platform every vendor shares. Deliberately below the measured ceiling: the
 * number that matters is the one that stays polite, not the one that benchmarks
 * best.
 */
const READ_BACK_CONCURRENCY = 8;

/** HTTP status the platform answers for an id it does not hold (P21-T01). */
const NOT_FOUND_STATUS = 404;

/**
 * Submission detail and the "Check with SATUSEHAT" read-back for the
 * integrations monitor (P21-T03).
 *
 * Both answer **presence, never content**. The monitor is gated by
 * `satusehat.submission.read` (ADMIN), was built as scheduling state (P10-T06),
 * and under P22 only clinicians may see a patient's record — so every path here
 * runs through {@link projectCheckedResource}, which is an allowlist because
 * every resource the platform returns carries the patient's name.
 */
@Injectable()
export class SatusehatSubmissionDetailService {
  private readonly logger = new Logger(SatusehatSubmissionDetailService.name);

  constructor(
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly httpClient: SatusehatHttpClient,
  ) {}

  async getSubmissionDetail(submissionId: string): Promise<SatusehatSubmissionDetailView> {
    const submission = await this.submissionRepository.findSubmissionById(submissionId);
    if (submission === null) {
      throw new NotFoundException('SATUSEHAT submission not found');
    }
    const records = await this.submissionRepository.findSubmissionResources(submissionId);
    return {
      submission: this.toSubmissionView(submission),
      // An empty list means one of two different things — this submission sent
      // nothing, or it predates P21-T02 — and the monitor has to tell them
      // apart, so it is reported rather than inferred from a zero count.
      hasResourceList: records.length > 0,
      isBackfilled: records.some((record) => record.isBackfilled),
      resources: this.groupResources(records),
    };
  }

  /**
   * Reads every recorded id back off the platform, capped at
   * {@link READ_BACK_CONCURRENCY}.
   *
   * A resource the platform no longer holds is `NOT_FOUND`, keyed on the HTTP
   * status: the 404 body says `code: "no-store"` and
   * `details.text: "storage_error"`, and neither string says "not found"
   * (P21-T01). Any other failure is `ERROR`, kept distinct because "SATUSEHAT
   * does not hold this" and "we could not ask" mean opposite things to an
   * operator deciding whether to resend. One failed read never fails the whole
   * check.
   */
  async checkSubmission(submissionId: string): Promise<SatusehatSubmissionCheckView> {
    const submission = await this.submissionRepository.findSubmissionById(submissionId);
    if (submission === null) {
      throw new NotFoundException('SATUSEHAT submission not found');
    }
    const records = await this.submissionRepository.findSubmissionResources(submissionId);
    const sent = records.filter((record) => record.outcome === 'SENT');
    const results = await this.readBackAll(sent);
    return {
      submissionId,
      checkedAt: new Date().toISOString(),
      results,
    };
  }

  /** Runs the reads in fixed-size waves rather than all at once. */
  private async readBackAll(
    records: readonly SatusehatSubmissionResourceRecord[],
  ): Promise<SatusehatResourceCheckResult[]> {
    const results: SatusehatResourceCheckResult[] = [];
    for (let index = 0; index < records.length; index += READ_BACK_CONCURRENCY) {
      const wave = records.slice(index, index + READ_BACK_CONCURRENCY);
      const settled = await Promise.all(wave.map((record) => this.readBackOne(record)));
      results.push(...settled);
    }
    return results;
  }

  private async readBackOne(
    record: SatusehatSubmissionResourceRecord,
  ): Promise<SatusehatResourceCheckResult> {
    if (record.satusehatId === null) {
      // Sent, but the transaction response could not be paired to it, so there
      // is no id to ask about. Not an error — the resource is on the platform,
      // we simply cannot name it.
      return {
        resourceType: record.resourceType,
        satusehatId: '',
        outcome: 'UNPAIRED',
        versionId: null,
        lastUpdated: null,
        status: null,
        errorCode: null,
      };
    }
    try {
      const resource = await this.httpClient.sendRequest<unknown>({
        method: 'GET',
        path: `/${record.resourceType}/${record.satusehatId}`,
      });
      const projected = projectCheckedResource(resource);
      return {
        resourceType: record.resourceType,
        satusehatId: record.satusehatId,
        ...projected,
        errorCode: null,
      };
    } catch (caughtError) {
      return this.toFailedResult(record, caughtError);
    }
  }

  private toFailedResult(
    record: SatusehatSubmissionResourceRecord,
    caughtError: unknown,
  ): SatusehatResourceCheckResult {
    const isNotFound =
      caughtError instanceof SatusehatError && caughtError.upstreamStatusCode === NOT_FOUND_STATUS;
    if (!isNotFound) {
      this.logger.warn(
        `SATUSEHAT read-back failed for ${record.resourceType}: ${
          caughtError instanceof SatusehatError ? caughtError.code : 'unknown error'
        }`,
      );
    }
    return {
      resourceType: record.resourceType,
      satusehatId: record.satusehatId ?? '',
      outcome: isNotFound ? 'NOT_FOUND' : 'ERROR',
      versionId: null,
      lastUpdated: null,
      status: null,
      errorCode: isNotFound || !(caughtError instanceof SatusehatError) ? null : caughtError.code,
    };
  }

  /**
   * Collapses the recorded rows into one group per resource type: how many were
   * sent, which ids they got, how many could not be paired, and the skips by
   * reason category. Counts and categories only — a skipped medication's name
   * would tell an administrator what the patient was prescribed.
   */
  private groupResources(
    records: readonly SatusehatSubmissionResourceRecord[],
  ): SatusehatSubmissionResourceGroup[] {
    const byType = new Map<string, SatusehatSubmissionResourceRecord[]>();
    for (const record of records) {
      const bucket = byType.get(record.resourceType);
      if (bucket) {
        bucket.push(record);
      } else {
        byType.set(record.resourceType, [record]);
      }
    }
    return [...byType].map(([resourceType, rows]) => {
      const sent = rows.filter((row) => row.outcome === 'SENT');
      return {
        resourceType,
        sentCount: sent.length,
        satusehatIds: sent.map((row) => row.satusehatId).filter((id): id is string => id !== null),
        unpairedCount: sent.filter((row) => row.satusehatId === null).length,
        skipped: this.groupSkips(rows),
      };
    });
  }

  private groupSkips(
    rows: readonly SatusehatSubmissionResourceRecord[],
  ): SatusehatSubmissionSkipGroup[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.outcome === 'SKIPPED' && row.skipReason !== null) {
        counts.set(row.skipReason, (counts.get(row.skipReason) ?? 0) + 1);
      }
    }
    return [...counts].map(([reason, count]) => ({
      reason: reason as SatusehatSubmissionSkipGroup['reason'],
      count,
    }));
  }

  /** Same ISO-string shape the list endpoint returns, so the drawer reuses it. */
  private toSubmissionView(
    submission: Awaited<ReturnType<SatusehatSubmissionRepository['findSubmissionById']>>,
  ): SatusehatSubmissionDetailView['submission'] {
    if (submission === null) {
      throw new NotFoundException('SATUSEHAT submission not found');
    }
    return {
      id: submission.id,
      kind: submission.kind,
      encounterId: submission.encounterId,
      labOrderId: submission.labOrderId,
      labOrderNumber: submission.labOrderNumber,
      status: submission.status,
      attempts: submission.attempts,
      lastError: submission.lastError,
      nextAttemptAt: submission.nextAttemptAt.toISOString(),
      lastAttemptAt: submission.lastAttemptAt?.toISOString() ?? null,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      satusehatEncounterId: submission.satusehatEncounterId,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
    };
  }
}
