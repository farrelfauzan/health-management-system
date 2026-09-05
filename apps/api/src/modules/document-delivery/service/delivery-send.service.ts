import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DeliveryDestination,
  DeliveryRecord,
  DeliveryTransportResult,
  DocumentDeliveryConfig,
  InvoiceDeliveryMessageContext,
  InvoiceDeliverySubjectRecord,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import {
  buildInvoiceDeliveryMail,
  buildInvoiceWhatsappCaption,
} from './build-invoice-delivery-copy';
import { DeliveryLinkService } from './delivery-link.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import { ProtectDeliveryDocumentService } from './protect-delivery-document.service';

const DELIVERY_AUDIT_RESOURCE = 'DocumentDelivery';
const PDF_MIME_TYPE = 'application/pdf';
const DELIVERABLE_INVOICE_STATUSES: ReadonlySet<string> = new Set(['ISSUED', 'PAID']);
const BACKOFF_EXPONENT_BASE = 2;

export const SEND_CANCELLED_INVOICE_REASON = 'INVOICE_NO_LONGER_DELIVERABLE';
export const SEND_CANCELLED_CONSENT_PREFIX = 'DELIVERY_REFUSED_AT_SEND_TIME';
export const SEND_FAILED_MAIL_REJECTED = 'MAIL_REJECTED_BY_TRANSPORT';

/**
 * One claimed row, sent (`P16-T26`, FR-E4-10/13/15/18).
 *
 * Every rule the request checked is checked again here, because this is
 * when it has to be true: a scheduled send is days after the click, and a
 * consent withdrawn or an invoice voided in between cancels the send rather
 * than being honoured retroactively. The rendered snapshot the request
 * pinned is what goes out; for an attachment it is locked with the
 * patient's password first, for a link the token is minted now and the
 * plaintext lives only in the message.
 *
 * Outcomes are settled on the row, never thrown to the worker: the transport
 * rejecting or being unreachable reschedules with exponential backoff until
 * the attempt cap, then FAILED with the reason for the timeline and a
 * *Retry* button. Every outcome is audited (FR-E4-18).
 */
@Injectable()
export class DeliverySendService {
  private readonly logger = new Logger(DeliverySendService.name);
  private readonly deliveryConfig: DocumentDeliveryConfig;

  constructor(
    configService: ConfigService,
    private readonly deliveryRepository: DocumentDeliveryRepository,
    private readonly invoiceDocumentService: InvoiceDocumentService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly consentService: PatientDeliveryConsentService,
    private readonly protectService: ProtectDeliveryDocumentService,
    private readonly deliveryLinkService: DeliveryLinkService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {
    this.deliveryConfig = resolveDocumentDeliveryConfig(configService);
  }

  async processDelivery(delivery: DeliveryRecord): Promise<void> {
    if (delivery.invoiceId === null || delivery.invoiceDocumentId === null) {
      // Clinical-document deliveries arrive with P16-T40; until then a row
      // without an invoice is a row this worker does not know how to send.
      await this.settleFailed(delivery, 'UNSUPPORTED_DELIVERY_SUBJECT');
      return;
    }
    const subject = await this.invoiceDocumentService.findDeliverySubject(
      delivery.invoiceId,
      delivery.invoiceDocumentId,
    );
    if (!isStillDeliverable(subject)) {
      await this.cancel(delivery, SEND_CANCELLED_INVOICE_REASON);
      return;
    }
    const check = await this.consentService.isDeliveryAllowed({
      patientId: delivery.patientId,
      channel: delivery.channel,
    });
    if (!check.isAllowed || check.destination === null) {
      await this.cancel(
        delivery,
        `${SEND_CANCELLED_CONSENT_PREFIX}:${check.refusalReason ?? 'UNKNOWN'}`,
      );
      return;
    }
    try {
      const result = await this.send(delivery, subject, check.destination);
      await this.settleSent(delivery, result);
    } catch (err: unknown) {
      await this.settleError(delivery, err);
    }
  }

  private async send(
    delivery: DeliveryRecord,
    subject: InvoiceDeliverySubjectRecord,
    destination: DeliveryDestination,
  ): Promise<DeliveryTransportResult> {
    const clinicName = await this.clinicProfileService.getClinicName();
    const fileName = this.invoiceDocumentService.buildFileName(subject.invoice.invoiceNumber);
    const baseContext = {
      clinicName,
      patientName: subject.patient.fullName,
      invoiceNumber: subject.invoice.invoiceNumber,
      totalAmount: subject.invoice.totalAmount,
      issuedAt: subject.invoice.issuedAt,
    };
    if (delivery.shape === 'LINK') {
      const link = await this.deliveryLinkService.mintLink(delivery.id);
      const context: InvoiceDeliveryMessageContext = {
        ...baseContext,
        passwordSentence: null,
        link,
      };
      return this.transport(destination, context, null, fileName);
    }
    const stored = await this.objectStorageService.getObject({
      key: subject.document?.storageKey ?? '',
    });
    const protectedDocument = await this.protectService.protectForPatient({
      pdf: stored.body,
      patient: subject.patient,
    });
    const context: InvoiceDeliveryMessageContext = {
      ...baseContext,
      passwordSentence: this.protectService.describeScheme(),
      link: null,
    };
    return this.transport(destination, context, protectedDocument.content, fileName);
  }

  private async transport(
    destination: DeliveryDestination,
    context: InvoiceDeliveryMessageContext,
    attachment: Uint8Array | null,
    fileName: string,
  ): Promise<DeliveryTransportResult> {
    if (destination.channel === 'WHATSAPP') {
      const caption = buildInvoiceWhatsappCaption(context);
      if (attachment === null) {
        await this.whatsappGateway.sendText({
          externalChatId: destination.externalChatId,
          text: caption,
        });
      } else {
        await this.whatsappGateway.sendDocument({
          externalChatId: destination.externalChatId,
          fileName,
          mimeType: PDF_MIME_TYPE,
          content: attachment,
          caption,
        });
      }
      return { providerMessageId: null };
    }
    const mail = buildInvoiceDeliveryMail(context);
    const result = await this.mailService.sendMail({
      to: destination.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments:
        attachment === null
          ? undefined
          : [{ fileName, mimeType: PDF_MIME_TYPE, content: attachment }],
    });
    if (!result.accepted) {
      throw new MailRejectedError();
    }
    return { providerMessageId: result.messageId ?? null };
  }

  private async settleSent(
    delivery: DeliveryRecord,
    result: DeliveryTransportResult,
  ): Promise<void> {
    await this.deliveryRepository.markSent({
      id: delivery.id,
      sentAt: new Date(),
      providerMessageId: result.providerMessageId,
    });
    await this.audit(AuditAction.DELIVERY_SENT, delivery, { attempt: delivery.attemptCount + 1 });
  }

  /**
   * A rejected address is final; everything else — bridge down, SMTP
   * unreachable, storage hiccup — is worth another try on the backoff.
   */
  private async settleError(delivery: DeliveryRecord, err: unknown): Promise<void> {
    const reason =
      err instanceof MailRejectedError ? SEND_FAILED_MAIL_REJECTED : describeError(err);
    const attemptNumber = delivery.attemptCount + 1;
    const isFinal =
      err instanceof MailRejectedError || attemptNumber >= this.deliveryConfig.maxAttempts;
    this.logger.warn(
      buildSafeErrorLog('document_delivery_send_failed', {
        deliveryId: delivery.id,
        channel: delivery.channel,
        attempt: attemptNumber,
        isFinal: isFinal ? 'true' : 'false',
      }),
    );
    if (isFinal) {
      await this.settleFailed(delivery, reason);
      return;
    }
    const delayMs =
      this.deliveryConfig.retryBaseDelayMs * BACKOFF_EXPONENT_BASE ** (attemptNumber - 1);
    await this.deliveryRepository.rescheduleAttempt({
      id: delivery.id,
      error: reason,
      nextAttemptAt: new Date(Date.now() + delayMs),
    });
  }

  private async settleFailed(delivery: DeliveryRecord, reason: string): Promise<void> {
    await this.deliveryRepository.markFailed({ id: delivery.id, error: reason });
    await this.audit(AuditAction.DELIVERY_FAILED, delivery, {
      reason,
      attempt: delivery.attemptCount + 1,
    });
  }

  private async cancel(delivery: DeliveryRecord, reason: string): Promise<void> {
    await this.deliveryRepository.markCancelled({
      id: delivery.id,
      reason,
      cancelledAt: new Date(),
    });
    await this.audit(AuditAction.DELIVERY_CANCELLED, delivery, { reason, cancelledBy: 'WORKER' });
  }

  private async audit(
    action: AuditAction,
    delivery: DeliveryRecord,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: delivery.id,
      actorUserId: null,
      patientId: delivery.patientId,
      metadata: {
        channel: delivery.channel,
        shape: delivery.shape,
        invoiceId: delivery.invoiceId,
        ...metadata,
      },
    });
  }
}

class MailRejectedError extends Error {
  constructor() {
    super('The mail transport did not accept the message');
    this.name = 'MailRejectedError';
  }
}

/** FR-E4-02 again, at send time: still ISSUED or PAID, snapshot still READY. */
function isStillDeliverable(subject: InvoiceDeliverySubjectRecord): boolean {
  return (
    DELIVERABLE_INVOICE_STATUSES.has(subject.invoice.status) &&
    subject.document !== null &&
    subject.document.status === 'READY' &&
    subject.document.storageKey !== null
  );
}

/** The error's name only: a transport error can quote the message it carried. */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'Error' ? 'SEND_FAILED' : err.name;
  }
  return 'SEND_FAILED';
}
