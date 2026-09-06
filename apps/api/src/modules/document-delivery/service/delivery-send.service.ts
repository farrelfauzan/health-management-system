import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ClinicalDeliverySubjectRecord,
  DeliveryDestination,
  DeliveryRecord,
  DeliveryTransportResult,
  DocumentDeliveryConfig,
  InvoiceDeliveryMessageContext,
  InvoiceDeliverySubjectRecord,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';
import { RenderedMail } from '../../../common/mail/mail.types';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import {
  buildClinicalDeliveryMail,
  buildClinicalWhatsappCaption,
} from './build-clinical-delivery-copy';
import {
  buildInvoiceDeliveryMail,
  buildInvoiceWhatsappCaption,
} from './build-invoice-delivery-copy';
import { DeliveryLinkService } from './delivery-link.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import { ProtectDeliveryDocumentService } from './protect-delivery-document.service';
import { isPdfWrappableImageMimeType, wrapImageInPdf } from './wrap-image-in-pdf';

const DELIVERY_AUDIT_RESOURCE = 'DocumentDelivery';
const PDF_MIME_TYPE = 'application/pdf';
const PDF_FILE_EXTENSION = '.pdf';
const DELIVERABLE_INVOICE_STATUSES: ReadonlySet<string> = new Set(['ISSUED', 'PAID']);
const BACKOFF_EXPONENT_BASE = 2;
const ASCII_FILENAME_SAFE_PATTERN = /[^a-zA-Z0-9 ._-]/g;
const MAX_FILENAME_STEM_LENGTH = 80;
const FALLBACK_FILENAME_STEM = 'dokumen';

export const SEND_CANCELLED_INVOICE_REASON = 'INVOICE_NO_LONGER_DELIVERABLE';
export const SEND_CANCELLED_DOCUMENT_REASON = 'DOCUMENT_NO_LONGER_DELIVERABLE';
export const SEND_CANCELLED_CONSENT_PREFIX = 'DELIVERY_REFUSED_AT_SEND_TIME';
export const SEND_FAILED_MAIL_REJECTED = 'MAIL_REJECTED_BY_TRANSPORT';
export const SEND_FAILED_FORMAT_NOT_DELIVERABLE = 'FORMAT_NOT_DELIVERABLE';

/** What a send puts on the wire, whichever document is inside: one caption, one mail. */
type DeliveryMessage = { caption: string; mail: RenderedMail };

/**
 * One claimed row, sent (`P16-T26`, FR-E4-10/13/15/18) — an invoice, or
 * since `P16-T40` a released clinical document (D-028: one table, one
 * worker, two subjects).
 *
 * Every rule the request checked is checked again here, because this is
 * when it has to be true: a scheduled send is days after the click, and a
 * consent withdrawn, an invoice voided or a document retired in between
 * cancels the send rather than being honoured retroactively. The rendered
 * snapshot the request pinned is what goes out; for an attachment it is
 * locked with the patient's password first, for a link the token is minted
 * now and the plaintext lives only in the message. A clinical file that is
 * an image becomes a one-page PDF first, because the lock is the whole
 * reason it may leave (D-027).
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
    if (delivery.documentId !== null) {
      await this.processClinicalDelivery(delivery, delivery.documentId);
      return;
    }
    if (delivery.invoiceId === null || delivery.invoiceDocumentId === null) {
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
    const destination = await this.resolveDestinationOrCancel(delivery);
    if (destination === null) {
      return;
    }
    try {
      const result = await this.sendInvoice(delivery, subject, destination);
      await this.settleSent(delivery, result);
    } catch (err: unknown) {
      await this.settleError(delivery, err);
    }
  }

  /**
   * FR-E4-26 at send time: the document must still be released and still
   * live. A release is never undone, but a document can be retired between
   * the click and the sweep, and a retired result must not go out.
   */
  private async processClinicalDelivery(
    delivery: DeliveryRecord,
    documentId: string,
  ): Promise<void> {
    const subject = await this.deliveryRepository.findClinicalDeliverySubject(documentId);
    if (subject === null || !subject.document.releasedToPatient || subject.document.isDeleted) {
      await this.cancel(delivery, SEND_CANCELLED_DOCUMENT_REASON);
      return;
    }
    const destination = await this.resolveDestinationOrCancel(delivery);
    if (destination === null) {
      return;
    }
    try {
      const result = await this.sendClinicalDocument(delivery, subject, destination);
      await this.settleSent(delivery, result);
    } catch (err: unknown) {
      if (err instanceof FormatNotDeliverableError) {
        await this.settleFailed(delivery, SEND_FAILED_FORMAT_NOT_DELIVERABLE);
        return;
      }
      await this.settleError(delivery, err);
    }
  }

  private async resolveDestinationOrCancel(
    delivery: DeliveryRecord,
  ): Promise<DeliveryDestination | null> {
    const check = await this.consentService.isDeliveryAllowed({
      patientId: delivery.patientId,
      channel: delivery.channel,
    });
    if (!check.isAllowed || check.destination === null) {
      await this.cancel(
        delivery,
        `${SEND_CANCELLED_CONSENT_PREFIX}:${check.refusalReason ?? 'UNKNOWN'}`,
      );
      return null;
    }
    return check.destination;
  }

  private async sendInvoice(
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
      return this.transport(destination, buildInvoiceMessage(context), null, fileName);
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
    return this.transport(
      destination,
      buildInvoiceMessage(context),
      protectedDocument.content,
      fileName,
    );
  }

  /**
   * A released clinical document, as a locked PDF (`P16-T40`). Attachment
   * only — a result never leaves as a link — and the caption names the
   * clinic, the document type and the date, never the title (FR-E4-27).
   */
  private async sendClinicalDocument(
    delivery: DeliveryRecord,
    subject: ClinicalDeliverySubjectRecord,
    destination: DeliveryDestination,
  ): Promise<DeliveryTransportResult> {
    const clinicName = await this.clinicProfileService.getClinicName();
    const stored = await this.objectStorageService.getObject({ key: subject.document.storageKey });
    const pdf = await this.resolvePdfBytes(stored.body, subject.document.mimeType);
    const protectedDocument = await this.protectService.protectForPatient({
      pdf,
      patient: subject.patient,
    });
    const message = buildClinicalMessage({
      clinicName,
      patientName: subject.patient.fullName,
      category: subject.document.category,
      documentDate: subject.document.documentDate,
      passwordSentence: this.protectService.describeScheme(),
    });
    return this.transport(
      destination,
      message,
      protectedDocument.content,
      buildClinicalFileName(subject.document.title),
    );
  }

  private async resolvePdfBytes(body: Uint8Array, mimeType: string): Promise<Uint8Array> {
    if (mimeType === PDF_MIME_TYPE) {
      return body;
    }
    if (isPdfWrappableImageMimeType(mimeType)) {
      return wrapImageInPdf({ image: body, mimeType });
    }
    throw new FormatNotDeliverableError(mimeType);
  }

  private async transport(
    destination: DeliveryDestination,
    message: DeliveryMessage,
    attachment: Uint8Array | null,
    fileName: string,
  ): Promise<DeliveryTransportResult> {
    if (destination.channel === 'WHATSAPP') {
      if (attachment === null) {
        await this.whatsappGateway.sendText({
          externalChatId: destination.externalChatId,
          text: message.caption,
        });
      } else {
        await this.whatsappGateway.sendDocument({
          externalChatId: destination.externalChatId,
          fileName,
          mimeType: PDF_MIME_TYPE,
          content: attachment,
          caption: message.caption,
        });
      }
      return { providerMessageId: null };
    }
    const result = await this.mailService.sendMail({
      to: destination.email,
      subject: message.mail.subject,
      text: message.mail.text,
      html: message.mail.html,
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
        documentId: delivery.documentId,
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

/** A stored type that cannot become a locked PDF — final, not worth a retry. */
class FormatNotDeliverableError extends Error {
  constructor(mimeType: string) {
    super(`A ${mimeType} document cannot be delivered as a locked PDF`);
    this.name = 'FormatNotDeliverableError';
  }
}

function buildInvoiceMessage(context: InvoiceDeliveryMessageContext): DeliveryMessage {
  return { caption: buildInvoiceWhatsappCaption(context), mail: buildInvoiceDeliveryMail(context) };
}

function buildClinicalMessage(
  context: Parameters<typeof buildClinicalWhatsappCaption>[0],
): DeliveryMessage {
  return {
    caption: buildClinicalWhatsappCaption(context),
    mail: buildClinicalDeliveryMail(context),
  };
}

/**
 * The file name the patient saves. The title is the one place the document's
 * own words reach the transport — as a *file name*, which the lock-screen
 * rule (FR-E4-27) does not cover — so it is reduced to ASCII and capped, and
 * always ends in `.pdf` because that is what the locked bytes are.
 */
function buildClinicalFileName(title: string): string {
  const stem = title
    .replace(ASCII_FILENAME_SAFE_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_STEM_LENGTH);
  return `${stem || FALLBACK_FILENAME_STEM}${PDF_FILE_EXTENSION}`;
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
