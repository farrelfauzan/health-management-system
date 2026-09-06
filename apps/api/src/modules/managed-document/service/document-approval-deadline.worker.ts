import {
  DocumentApprovalConfig,
  DocumentApprovalDeadlineKind,
  DocumentApprovalDeadlineRecord,
} from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveDocumentApprovalConfig } from '../document-approval.config';
import { DocumentApprovalRepository } from '../repository/document-approval.repository';
import { DocumentApprovalNotificationService } from './document-approval-notification.service';

const DEADLINE_KINDS: readonly DocumentApprovalDeadlineKind[] = ['DUE_SOON', 'OVERDUE'];

/**
 * Deadline reminders and the overdue flag (`P16-T30`, FR-E5-27/28).
 *
 * **This job writes notifications and stamps, and nothing else.** There is
 * no branch here that records a decision, resolves a round or changes a
 * document's status, and that absence is the requirement: a missed deadline
 * escalates attention, it does not decide. An approval nobody made must
 * never exist, so the one thing a deadline may never do is create one
 * (FR-E5-28). `DocumentApprovalRepository.claimDecision` is deliberately not
 * injected here — adding an auto-decision would be a visible change to this
 * file's dependencies rather than one more argument.
 *
 * Idempotence comes from the claim, not from the schedule. Each round
 * carries a stamp per notice kind, and {@link
 * DocumentApprovalRepository.claimDeadlineNotice} sets it conditionally, so
 * a second tick — or a second process — sends nothing. That is also what
 * makes a job that was down for a day correct rather than noisy: the
 * reminder fires once when the sweep comes back, because the claim is keyed
 * to the round and not to a calendar moment the job had to be running to
 * observe.
 */
@Injectable()
export class DocumentApprovalDeadlineWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentApprovalDeadlineWorker.name);
  private readonly config: DocumentApprovalConfig;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly approvalRepository: DocumentApprovalRepository,
    private readonly notificationService: DocumentApprovalNotificationService,
    configService: ConfigService,
  ) {
    this.config = resolveDocumentApprovalConfig(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.config.isSweepEnabled) {
      this.logger.log('Approval deadline sweep disabled (DOCUMENT_APPROVAL_SWEEP_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.config.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Approval deadline sweep running every ${this.config.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Runs one sweep and returns how many notices it sent. */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      let sentCount = 0;
      for (const kind of DEADLINE_KINDS) {
        sentCount += await this.sweepKind(kind);
      }
      return sentCount;
    } catch {
      this.logger.error(buildSafeErrorLog('document_approval_deadline_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  private async sweepKind(kind: DocumentApprovalDeadlineKind): Promise<number> {
    const candidates = await this.approvalRepository.listDeadlineCandidates({
      kind,
      threshold: this.resolveThreshold(kind),
      limit: this.config.sweepBatchSize,
    });
    let sentCount = 0;
    for (const candidate of candidates) {
      if (!(await this.approvalRepository.claimDeadlineNotice(candidate.requestId, kind))) {
        continue;
      }
      await this.announce(kind, candidate);
      sentCount += 1;
    }
    return sentCount;
  }

  /**
   * Due-soon looks ahead by the configured window; overdue looks at now.
   * Both compare against `dueAt <= threshold`, so one query shape serves
   * both and a round that was already overdue when the window opened still
   * gets its reminder before its overdue notice.
   */
  private resolveThreshold(kind: DocumentApprovalDeadlineKind): Date {
    const now = Date.now();
    return new Date(kind === 'DUE_SOON' ? now + this.config.dueSoonWindowMs : now);
  }

  /**
   * The approvers who have not answered are who a reminder is for — the
   * drafter is not chased about a decision that is not theirs to make.
   */
  private async announce(
    kind: DocumentApprovalDeadlineKind,
    candidate: DocumentApprovalDeadlineRecord,
  ): Promise<void> {
    const round = await this.approvalRepository.findRequestById(candidate.requestId);
    if (round === null) {
      return;
    }
    const decidedIds = new Set(round.decisions.map((decision) => decision.approverId));
    await this.notificationService.announce({
      kind: kind === 'DUE_SOON' ? 'DUE_SOON' : 'OVERDUE',
      documentId: candidate.documentId,
      documentTitle: candidate.documentTitle,
      documentTypeName: candidate.documentTypeName,
      drafterEmail: round.submittedBy.email,
      dueAt: candidate.dueAt,
      reason: null,
      recipients: round.approvers
        .filter((approver) => approver.isEligible && !decidedIds.has(approver.approverId))
        .map((approver) => ({ userId: approver.approverId, email: approver.email })),
    });
  }
}
