import {
  ListSatusehatSubmissionsQueryInput,
  SatusehatSubmissionRecord,
  SatusehatSubmissionView,
  SatusehatSubmissionsListResult,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionService } from './satusehat-submission.service';

const SUBMISSION_AUDIT_RESOURCE = 'SatusehatSubmission';

/**
 * Admin ops surface over the SATUSEHAT submission outbox (P10-T06). Listing
 * exposes scheduling state only — the outbox carries no payload snapshot, so
 * nothing clinical can leak here. Retry re-opens a FAILED row with a fresh
 * attempt budget and processes it synchronously through the same
 * {@link SatusehatSubmissionService} the worker uses, so the admin sees the
 * real outcome (SUBMITTED, rescheduled PENDING, or FAILED again) immediately
 * instead of waiting for the next poll cycle.
 */
@Injectable()
export class SatusehatSubmissionOpsService {
  constructor(
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly submissionService: SatusehatSubmissionService,
    private readonly auditService: AuditService,
  ) {}

  async listSubmissions(
    query: ListSatusehatSubmissionsQueryInput,
  ): Promise<SatusehatSubmissionsListResult> {
    const page = await this.submissionRepository.findSubmissionPage({
      status: query.status,
      encounterId: query.encounterId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: page.items.map((record) => this.toSubmissionView(record)),
      meta: { page: query.page, limit: query.limit, total: page.total },
    };
  }

  async retrySubmission(id: string, currentUser: CurrentUser): Promise<SatusehatSubmissionView> {
    const submission = await this.submissionRepository.findSubmissionById(id);
    if (!submission) {
      throw new NotFoundException('SATUSEHAT submission not found');
    }
    this.assertRetryable(submission);
    const requeued = await this.submissionRepository.requeueSubmission(id);
    await this.auditService.record({
      action: 'SATUSEHAT_SUBMISSION_RETRIED',
      resource: SUBMISSION_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: { encounterId: submission.encounterId, previousAttempts: submission.attempts },
    });
    await this.submissionService.processSubmission(requeued);
    const settled = await this.submissionRepository.findSubmissionById(id);
    return this.toSubmissionView(settled ?? requeued);
  }

  private assertRetryable(submission: SatusehatSubmissionRecord): void {
    if (submission.status === 'SUBMITTED') {
      throw new ConflictException('Submission was already accepted by SATUSEHAT');
    }
    if (submission.status === 'PENDING') {
      throw new ConflictException('Submission is already queued for the worker');
    }
  }

  private toSubmissionView(record: SatusehatSubmissionRecord): SatusehatSubmissionView {
    return {
      id: record.id,
      encounterId: record.encounterId,
      status: record.status,
      attempts: record.attempts,
      lastError: record.lastError,
      nextAttemptAt: record.nextAttemptAt.toISOString(),
      lastAttemptAt: record.lastAttemptAt?.toISOString() ?? null,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      satusehatEncounterId: record.satusehatEncounterId,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
