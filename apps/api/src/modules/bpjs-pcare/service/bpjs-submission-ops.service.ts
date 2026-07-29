import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import {
  BpjsSubmissionRecord,
  BpjsSubmissionView,
  BpjsSubmissionsListResult,
  ListBpjsSubmissionsQueryInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsSubmissionRepository } from '../repository/bpjs-submission.repository';
import { BpjsSubmissionService } from './bpjs-submission.service';

const SUBMISSION_AUDIT_RESOURCE = 'BpjsSubmission';

/**
 * Admin surface over the BPJS submission outbox, mirroring the SATUSEHAT
 * ops service: the list exposes scheduling state only (no payload snapshot
 * exists, so nothing clinical can leak), and retry accepts only FAILED rows
 * — SUBMITTED is done and PENDING needs no help. A retry resets the attempt
 * budget (the budget rationed the old failure cause) and processes the row
 * synchronously so the admin sees the real settled outcome in the response.
 */
@Injectable()
export class BpjsSubmissionOpsService {
  constructor(
    private readonly submissionRepository: BpjsSubmissionRepository,
    private readonly submissionService: BpjsSubmissionService,
    private readonly auditService: AuditService,
  ) {}

  async listSubmissions(query: ListBpjsSubmissionsQueryInput): Promise<BpjsSubmissionsListResult> {
    const page = await this.submissionRepository.findSubmissionPage({
      status: query.status,
      type: query.type,
      registrationId: query.registrationId,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: page.items.map((record) => this.toSubmissionView(record)),
      meta: { page: query.page, limit: query.limit, total: page.total },
    };
  }

  async retrySubmission(id: string, currentUser: CurrentUser): Promise<BpjsSubmissionView> {
    const submission = await this.submissionRepository.findSubmissionById(id);
    if (submission === null) {
      throw new NotFoundException('BPJS submission not found');
    }
    this.assertRetryable(submission);
    const requeued = await this.submissionRepository.requeueSubmission(id);
    await this.auditService.record({
      action: 'BPJS_SUBMISSION_RETRIED',
      resource: SUBMISSION_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      metadata: {
        registrationId: submission.registrationId,
        type: submission.type,
        previousAttempts: submission.attempts,
      },
    });
    await this.submissionService.processSubmission(requeued);
    const settled = await this.submissionRepository.findSubmissionById(id);
    return this.toSubmissionView(settled ?? requeued);
  }

  private assertRetryable(submission: BpjsSubmissionRecord): void {
    if (submission.status === 'SUBMITTED') {
      throw new ConflictException('Submission was already accepted by BPJS PCare');
    }
    if (submission.status === 'PENDING') {
      throw new ConflictException('Submission is already queued for the worker');
    }
  }

  private toSubmissionView(record: BpjsSubmissionRecord): BpjsSubmissionView {
    return {
      id: record.id,
      registrationId: record.registrationId,
      type: record.type,
      status: record.status,
      attempts: record.attempts,
      lastError: record.lastError,
      nextAttemptAt: record.nextAttemptAt.toISOString(),
      lastAttemptAt: record.lastAttemptAt === null ? null : record.lastAttemptAt.toISOString(),
      submittedAt: record.submittedAt === null ? null : record.submittedAt.toISOString(),
      bpjsReferenceNo: record.bpjsReferenceNo,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
