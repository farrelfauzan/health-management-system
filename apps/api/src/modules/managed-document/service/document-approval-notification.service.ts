import { DocumentApprovalConfig, DocumentApprovalRequestRecord } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from '../../../common/mail/mail.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { NotificationType } from '../../../generated/prisma/client';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { NotificationService } from '../../notification/service/notification.service';
import { resolveDocumentApprovalConfig } from '../document-approval.config';
import {
  DocumentApprovalMailKind,
  buildDocumentApprovalMail,
} from './build-document-approval-copy';

/** Who and what one announcement is about, whichever event raised it. */
export type DocumentApprovalAnnouncement = {
  kind: DocumentApprovalMailKind;
  documentId: string;
  documentTitle: string;
  documentTypeName: string;
  drafterEmail: string;
  dueAt: Date | null;
  reason: string | null;
  recipients: ReadonlyArray<{ userId: string; email: string }>;
};

const NOTIFICATION_TYPE_BY_KIND: Readonly<Record<DocumentApprovalMailKind, NotificationType>> = {
  REQUESTED: NotificationType.DOCUMENT_APPROVAL_REQUESTED,
  APPROVED: NotificationType.DOCUMENT_APPROVAL_APPROVED,
  REJECTED: NotificationType.DOCUMENT_APPROVAL_REJECTED,
  SUPERSEDED: NotificationType.DOCUMENT_APPROVAL_SUPERSEDED,
  DUE_SOON: NotificationType.DOCUMENT_APPROVAL_DUE_SOON,
  OVERDUE: NotificationType.DOCUMENT_APPROVAL_OVERDUE,
};

const MESSAGE_KEY_BY_KIND: Readonly<Record<DocumentApprovalMailKind, string>> = {
  REQUESTED: 'documentApprovalRequested',
  APPROVED: 'documentApprovalApproved',
  REJECTED: 'documentApprovalRejected',
  SUPERSEDED: 'documentApprovalSuperseded',
  DUE_SOON: 'documentApprovalDueSoon',
  OVERDUE: 'documentApprovalOverdue',
};

/**
 * Both channels for every approval event (`P16-T30`, FR-E5-25/26) — the bell
 * feed **and** email, never one or the other. An approval nobody hears about
 * is a bottleneck, and the two channels fail differently: the feed needs the
 * person to open the app, the mail reaches them where they already are.
 *
 * Every method here is best-effort and swallows its own failures. That is
 * deliberate and load-bearing: the approval transaction has already
 * committed by the time this runs, and an SMTP outage must not roll back a
 * decision somebody made. The in-app row is written first for the same
 * reason — if mail is down, the notification still lands.
 */
@Injectable()
export class DocumentApprovalNotificationService {
  private readonly logger = new Logger(DocumentApprovalNotificationService.name);
  private readonly config: DocumentApprovalConfig;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
    private readonly clinicProfileService: ClinicProfileService,
    configService: ConfigService,
  ) {
    this.config = resolveDocumentApprovalConfig(configService);
  }

  /** Every named approver, told a decision is wanted (FR-E5-25). */
  async announceSubmitted(params: {
    round: DocumentApprovalRequestRecord;
    documentTitle: string;
    documentTypeName: string;
    drafterEmail: string;
  }): Promise<void> {
    await this.announce({
      kind: 'REQUESTED',
      documentId: params.round.documentId,
      documentTitle: params.documentTitle,
      documentTypeName: params.documentTypeName,
      drafterEmail: params.drafterEmail,
      dueAt: params.round.dueAt,
      reason: null,
      recipients: params.round.approvers.map((approver) => ({
        userId: approver.approverId,
        email: approver.email,
      })),
    });
  }

  /**
   * One announcement, both channels, one recipient list.
   *
   * The in-app rows go out in one call; the mails go out one at a time
   * because each carries a different address and a failure on one must not
   * cost the rest theirs.
   */
  async announce(announcement: DocumentApprovalAnnouncement): Promise<void> {
    if (announcement.recipients.length === 0) {
      return;
    }
    await this.createFeedRows(announcement);
    const clinicName = await this.resolveClinicName();
    for (const recipient of announcement.recipients) {
      await this.sendMail(announcement, recipient.email, clinicName);
    }
  }

  private async createFeedRows(announcement: DocumentApprovalAnnouncement): Promise<void> {
    const messageKey = MESSAGE_KEY_BY_KIND[announcement.kind];
    try {
      await this.notificationService.createForUsers(
        announcement.recipients.map((recipient) => recipient.userId),
        {
          type: NOTIFICATION_TYPE_BY_KIND[announcement.kind],
          titleKey: `${messageKey}.title`,
          bodyKey: `${messageKey}.body`,
          params: {
            documentTitle: announcement.documentTitle,
            documentTypeName: announcement.documentTypeName,
            drafterEmail: announcement.drafterEmail,
            ...(announcement.dueAt === null ? {} : { dueAt: announcement.dueAt.toISOString() }),
            ...(announcement.reason === null ? {} : { reason: announcement.reason }),
          },
          href: this.buildDocumentHref(announcement.documentId),
        },
      );
    } catch {
      this.logger.error(buildSafeErrorLog('document_approval_notification_failed'));
    }
  }

  private async sendMail(
    announcement: DocumentApprovalAnnouncement,
    to: string,
    clinicName: string,
  ): Promise<void> {
    try {
      const mail = buildDocumentApprovalMail({
        kind: announcement.kind,
        clinicName,
        documentTitle: announcement.documentTitle,
        documentTypeName: announcement.documentTypeName,
        drafterEmail: announcement.drafterEmail,
        dueAt: announcement.dueAt,
        reason: announcement.reason,
        actionUrl: this.buildDocumentUrl(announcement.documentId),
      });
      await this.mailService.sendMail({ to, ...mail });
    } catch {
      this.logger.error(buildSafeErrorLog('document_approval_mail_failed'));
    }
  }

  /** Falls back to the product label rather than sending from "" (FR-E5-30). */
  private async resolveClinicName(): Promise<string> {
    try {
      return await this.clinicProfileService.getClinicName();
    } catch {
      return 'Saling Jaga';
    }
  }

  private buildDocumentHref(documentId: string): string {
    return `/admin/documents/${documentId}`;
  }

  private buildDocumentUrl(documentId: string): string {
    return `${this.config.webAppBaseUrl}${this.buildDocumentHref(documentId)}`;
  }
}
