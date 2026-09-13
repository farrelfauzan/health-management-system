import {
  ListSatusehatSubmissionsQueryInput,
  SatusehatEnvironmentStatus,
  SatusehatSubmissionRecord,
  SatusehatSubmissionView,
  SatusehatSubmissionsListResult,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { resolveSatusehatEnvironment } from '../../../common/satusehat/resolve-satusehat-environment';
import { resolveSatusehatHost } from '../../../common/satusehat/resolve-satusehat-host';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
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
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    configService: ConfigService,
    private readonly submissionRepository: SatusehatSubmissionRepository,
    private readonly submissionService: SatusehatSubmissionService,
    private readonly auditService: AuditService,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /**
   * Which SATUSEHAT platform this deployment actually talks to (P21-T06).
   *
   * Read from the configured base URL on every call rather than cached at boot
   * as a separate flag, because the whole value of showing it is that it cannot
   * disagree with where the bundles go. Carries no credentials and no
   * organization id — only the platform and its host.
   */
  getEnvironmentStatus(): SatusehatEnvironmentStatus {
    return {
      environment: resolveSatusehatEnvironment(this.satusehatConfig.fhirBaseUrl),
      isConfigured: this.satusehatConfig.isConfigured,
      fhirHost: resolveSatusehatHost(this.satusehatConfig.fhirBaseUrl),
    };
  }

  async listSubmissions(
    query: ListSatusehatSubmissionsQueryInput,
  ): Promise<SatusehatSubmissionsListResult> {
    const page = await this.submissionRepository.findSubmissionPage({
      status: query.status,
      kind: query.kind,
      encounterId: query.encounterId,
      labOrderId: query.labOrderId,
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
      metadata: {
        kind: submission.kind,
        encounterId: submission.encounterId,
        labOrderId: submission.labOrderId,
        previousAttempts: submission.attempts,
      },
    });
    await this.submissionService.processSubmission(requeued);
    const settled = await this.submissionRepository.findSubmissionById(id);
    await this.requeueDependentLabReports(settled ?? requeued);
    return this.toSubmissionView(settled ?? requeued);
  }

  /**
   * A lab report parks FAILED when the encounter it must reference never
   * reached the platform (P18-T09). Retrying that encounter is the admin
   * action that fixes the cause, so the reports waiting on it are re-opened
   * here rather than needing a second click each. Only on success: an
   * encounter that failed again leaves them parked, still explaining why.
   */
  private async requeueDependentLabReports(
    submission: SatusehatSubmissionRecord,
  ): Promise<void> {
    if (
      submission.kind !== 'ENCOUNTER' ||
      submission.status !== 'SUBMITTED' ||
      submission.encounterId === null
    ) {
      return;
    }
    await this.submissionRepository.requeueLabReportsForEncounter(submission.encounterId);
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
      kind: record.kind,
      encounterId: record.encounterId,
      labOrderId: record.labOrderId,
      labOrderNumber: record.labOrderNumber,
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
