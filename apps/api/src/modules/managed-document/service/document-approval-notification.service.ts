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
import { buildDocumentApprovalDigestMail } from './build-document-approval-digest-copy';
import {
  DocumentApprovalRecipientGroup,
  groupAnnouncementsByRecipient,
} from './group-announcements-by-recipient';

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

/** The kinds that ask the reader to decide — the ones whose digest links to the queue. */
const APPROVER_FACING_KINDS: ReadonlySet<DocumentApprovalMailKind> =
  new Set<DocumentApprovalMailKind>(['REQUESTED', 'DUE_SOON', 'OVERDUE']);

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

  /**
   * What every named approver is told when a round opens (FR-E5-25). Built
   * here and sent by the caller, which may be holding it for a batch.
   */
  buildSubmittedAnnouncement(params: {
    round: DocumentApprovalRequestRecord;
    documentTitle: string;
    documentTypeName: string;
    drafterEmail: string;
  }): DocumentApprovalAnnouncement {
    return {
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
    };
  }

  /** One announcement, both channels, one recipient list: a batch of one. */
  async announce(announcement: DocumentApprovalAnnouncement): Promise<void> {
    await this.announceBatch([announcement]);
  }

  /**
   * Many announcements from one action — a bulk submit, a bulk approval, one
   * deadline sweep — with one mail per person rather than one per document.
   *
   * The bell keeps a row per document, because each row is its own to-do
   * with its own link. Mail is where the count hurts: someone named on
   * twenty-eight documents gets one digest listing all of them, and someone
   * named on one gets the ordinary single-document mail. Mails go out one at
   * a time because each carries a different address and a failure on one
   * must not cost the rest theirs.
   */
  async announceBatch(announcements: readonly DocumentApprovalAnnouncement[]): Promise<void> {
    const addressed = announcements.filter((announcement) => announcement.recipients.length > 0);
    if (addressed.length === 0) {
      return;
    }
    for (const announcement of addressed) {
      await this.createFeedRows(announcement);
    }
    const clinicName = await this.resolveClinicName();
    for (const group of groupAnnouncementsByRecipient(addressed)) {
      await this.sendGroupMail(group, clinicName);
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

  private async sendGroupMail(
    group: DocumentApprovalRecipientGroup,
    clinicName: string,
  ): Promise<void> {
    const [onlyAnnouncement] = group.announcements;
    if (group.announcements.length === 1 && onlyAnnouncement !== undefined) {
      await this.sendMail(onlyAnnouncement, group.email, clinicName);
      return;
    }
    await this.sendDigestMail(group, clinicName);
  }

  private async sendDigestMail(
    group: DocumentApprovalRecipientGroup,
    clinicName: string,
  ): Promise<void> {
    try {
      const mail = buildDocumentApprovalDigestMail({
        kind: group.kind,
        clinicName,
        items: group.announcements.map((announcement) => ({
          documentTitle: announcement.documentTitle,
          documentTypeName: announcement.documentTypeName,
          drafterEmail: announcement.drafterEmail,
          dueAt: announcement.dueAt,
          reason: announcement.reason,
          actionUrl: this.buildDocumentUrl(announcement.documentId),
        })),
        overviewUrl: this.buildOverviewUrl(group.kind),
      });
      await this.mailService.sendMail({ to: group.email, ...mail });
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

  /**
   * Where a digest's reader works through the whole list: the approvals
   * queue for anything asking them to decide, the registry for news about
   * documents they sent.
   */
  private buildOverviewUrl(kind: DocumentApprovalMailKind): string {
    const tab = APPROVER_FACING_KINDS.has(kind) ? 'approvals' : 'registry';
    return `${this.config.webAppBaseUrl}/admin/documents?tab=${tab}`;
  }
}
