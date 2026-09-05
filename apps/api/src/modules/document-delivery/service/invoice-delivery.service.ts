import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateDeliveryData,
  DEFAULT_DELIVERY_SHAPE,
  DeliveryChannelValue,
  DeliveryDestination,
  DeliveryPasswordSourceValue,
  DeliveryRecord,
  DeliveryShapeValue,
  DeliveryStatusValue,
  DeliveryView,
  InvoiceDeliverySubjectRecord,
  InvoiceDeliveryTimelineView,
  RequestInvoiceDeliveryInput,
  RescheduleDeliveryInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliveryPasswordService } from './delivery-password.service';
import { maskDeliveryDestination } from './mask-delivery-destination';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import { toDeliveryView } from './to-delivery-view';

const DELIVERY_AUDIT_RESOURCE = 'DocumentDelivery';

/** The invoice states a bill may leave the building in (FR-E4-02). */
const DELIVERABLE_INVOICE_STATUSES: ReadonlySet<string> = new Set(['ISSUED', 'PAID']);

/** Any shape may be withdrawn before it goes; only a link after (FR-E4-11). */
const REVOCABLE_BEFORE_SEND: readonly DeliveryStatusValue[] = ['QUEUED', 'FAILED'];
const REVOCABLE_AFTER_SEND_AS_LINK: readonly DeliveryStatusValue[] = [
  'SENT',
  'DELIVERED',
  'OPENED',
];

export const INVOICE_NOT_DELIVERABLE_CODE = 'INVOICE_NOT_DELIVERABLE';
export const INVOICE_DOCUMENT_NOT_READY_CODE = 'INVOICE_DOCUMENT_NOT_READY';
export const DELIVERY_CHANNEL_REFUSED_CODE = 'DELIVERY_CHANNEL_REFUSED';
export const DELIVERY_NOT_RETRYABLE_CODE = 'DELIVERY_NOT_RETRYABLE';
export const DELIVERY_NOT_REVOCABLE_CODE = 'DELIVERY_NOT_REVOCABLE';
export const DELIVERY_NOT_SCHEDULABLE_CODE = 'DELIVERY_NOT_SCHEDULABLE';
export const DELIVERY_SEND_AT_IN_PAST_CODE = 'DELIVERY_SEND_AT_IN_PAST';
export const STAFF_CANCELLED_REASON = 'CANCELLED_BY_STAFF';

type PlannedDelivery = {
  channel: DeliveryChannelValue;
  destination: DeliveryDestination;
};

/**
 * Sending an invoice to its patient (`P16-T25`, FR-E4-01/02/12/14/18).
 *
 * A request is all-or-nothing across the channels it names: the send dialog
 * shows per-channel readiness before the cashier clicks, so a refusal here
 * is a rule that changed between the look and the click — consent withdrawn
 * at the counter, a link unverified — and the right answer is to say which,
 * not to send half. Every check that can be made now is made now (FR-E4-07's
 * missing date of birth included); the worker (`P16-T26`) makes them all
 * again at send time, because that is when they have to be true (FR-E4-10).
 *
 * Nothing is sent here. The rows go in QUEUED and the worker claims them.
 */
@Injectable()
export class InvoiceDeliveryService {
  constructor(
    private readonly deliveryRepository: DocumentDeliveryRepository,
    private readonly invoiceDocumentService: InvoiceDocumentService,
    private readonly consentService: PatientDeliveryConsentService,
    private readonly passwordService: DeliveryPasswordService,
    private readonly auditService: AuditService,
  ) {}

  async requestInvoiceDelivery(
    invoiceId: string,
    input: RequestInvoiceDeliveryInput,
    currentUser: CurrentUser,
  ): Promise<InvoiceDeliveryTimelineView> {
    const subject = await this.invoiceDocumentService.findDeliverySubject(invoiceId);
    const document = assertDeliverable(subject);
    const shape = input.shape ?? DEFAULT_DELIVERY_SHAPE;
    if (shape === 'ATTACHMENT') {
      this.passwordService.assertPasswordAvailable(subject.patient);
    }
    const sendAt = resolveSendAt(input.sendAt);
    const plans = await this.planChannels(subject.invoice.patientId, input.channels, currentUser);
    const passwordSource = shape === 'ATTACHMENT' ? this.passwordService.passwordSource : null;
    const rows = await this.deliveryRepository.createMany(
      plans.map((plan) =>
        buildCreateData({
          subject,
          documentId: document.id,
          plan,
          shape,
          passwordSource,
          sendAt,
          currentUser,
        }),
      ),
    );
    await Promise.all(rows.map((row) => this.auditRequested(row, currentUser)));
    return this.listInvoiceDeliveries(invoiceId);
  }

  async getDelivery(id: string): Promise<DeliveryView> {
    return toDeliveryView(await this.findDeliveryOrThrow(id));
  }

  /**
   * Calls off a send that has not gone yet (`P16-T38`, FR-E4-09). Only a
   * QUEUED row can be cancelled — anything later is either already out or
   * already settled, and revoke is the act for a link that is out.
   */
  async cancelDelivery(id: string, currentUser: CurrentUser): Promise<DeliveryView> {
    const row = await this.findDeliveryOrThrow(id);
    assertQueued(row, 'Only a delivery that has not been sent yet can be cancelled');
    const isCancelled = await this.deliveryRepository.markCancelled({
      id,
      reason: STAFF_CANCELLED_REASON,
      cancelledAt: new Date(),
    });
    if (!isCancelled) {
      throw new ConflictException({
        message: 'The delivery was sent before it could be cancelled',
        code: DELIVERY_NOT_SCHEDULABLE_CODE,
      });
    }
    await this.auditService.record({
      action: AuditAction.DELIVERY_CANCELLED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: {
        channel: row.channel,
        invoiceId: row.invoiceId,
        sendAt: row.sendAt,
        cancelledBy: 'STAFF',
      },
    });
    return toDeliveryView(await this.findDeliveryOrThrow(id));
  }

  /** Moves a QUEUED send to another future time (`P16-T38`). */
  async rescheduleDelivery(
    id: string,
    input: RescheduleDeliveryInput,
    currentUser: CurrentUser,
  ): Promise<DeliveryView> {
    const row = await this.findDeliveryOrThrow(id);
    assertQueued(row, 'Only a delivery that has not been sent yet can be rescheduled');
    const sendAt = resolveSendAt(input.sendAt) as Date;
    const isRescheduled = await this.deliveryRepository.updateSchedule({ id, sendAt });
    if (!isRescheduled) {
      throw new ConflictException({
        message: 'The delivery was claimed for sending before it could be rescheduled',
        code: DELIVERY_NOT_SCHEDULABLE_CODE,
      });
    }
    await this.auditService.record({
      action: AuditAction.DELIVERY_REQUESTED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: {
        channel: row.channel,
        invoiceId: row.invoiceId,
        rescheduledFrom: row.sendAt,
        sendAt,
      },
    });
    return toDeliveryView(await this.findDeliveryOrThrow(id));
  }

  async listInvoiceDeliveries(invoiceId: string): Promise<InvoiceDeliveryTimelineView> {
    await this.invoiceDocumentService.findDeliverySubject(invoiceId);
    const rows = await this.deliveryRepository.findByInvoice(invoiceId);
    return { invoiceId, deliveries: rows.map(toDeliveryView) };
  }

  /** FAILED → QUEUED. Resending a delivered invoice is a new request, not a retry. */
  async retryDelivery(id: string, currentUser: CurrentUser): Promise<DeliveryView> {
    const row = await this.findDeliveryOrThrow(id);
    if (row.status !== 'FAILED') {
      throw new ConflictException({
        message: 'Only a failed delivery can be retried',
        code: DELIVERY_NOT_RETRYABLE_CODE,
        errors: { status: row.status },
      });
    }
    const isRetried = await this.deliveryRepository.markRetried(id);
    if (!isRetried) {
      throw new ConflictException({
        message: 'The delivery changed state before it could be retried',
        code: DELIVERY_NOT_RETRYABLE_CODE,
      });
    }
    await this.auditService.record({
      action: AuditAction.DELIVERY_RETRIED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: { channel: row.channel, invoiceId: row.invoiceId, attemptCount: row.attemptCount },
    });
    return toDeliveryView(await this.findDeliveryOrThrow(id));
  }

  /**
   * Withdraws a send. Before it goes, any shape can be withdrawn; after, only
   * a link can be killed — an attachment already in a chat is in the chat,
   * and pretending otherwise would put a false REVOKED on the timeline.
   */
  async revokeDelivery(id: string, currentUser: CurrentUser): Promise<DeliveryView> {
    const row = await this.findDeliveryOrThrow(id);
    const fromStatuses = resolveRevocableStatuses(row.shape);
    if (!fromStatuses.includes(row.status)) {
      throw new ConflictException({
        message:
          row.shape === 'ATTACHMENT' && REVOCABLE_AFTER_SEND_AS_LINK.includes(row.status)
            ? 'An attachment that has already been sent cannot be taken back'
            : 'This delivery cannot be revoked from its current state',
        code: DELIVERY_NOT_REVOCABLE_CODE,
        errors: { status: row.status, shape: row.shape },
      });
    }
    const isRevoked = await this.deliveryRepository.markRevoked({
      id,
      revokedAt: new Date(),
      fromStatuses,
    });
    if (!isRevoked) {
      throw new ConflictException({
        message: 'The delivery changed state before it could be revoked',
        code: DELIVERY_NOT_REVOCABLE_CODE,
      });
    }
    await this.auditService.record({
      action: AuditAction.DELIVERY_REVOKED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: {
        channel: row.channel,
        shape: row.shape,
        invoiceId: row.invoiceId,
        fromStatus: row.status,
      },
    });
    return toDeliveryView(await this.findDeliveryOrThrow(id));
  }

  private async planChannels(
    patientId: string,
    channels: readonly DeliveryChannelValue[],
    currentUser: CurrentUser,
  ): Promise<PlannedDelivery[]> {
    const plans: PlannedDelivery[] = [];
    for (const channel of channels) {
      const check = await this.consentService.isDeliveryAllowed(
        { patientId, channel },
        currentUser.sub,
      );
      if (!check.isAllowed || check.destination === null) {
        throw new UnprocessableEntityException({
          message: `The patient cannot receive documents over ${channel} right now`,
          code: DELIVERY_CHANNEL_REFUSED_CODE,
          errors: { channel, refusalReason: check.refusalReason },
        });
      }
      plans.push({ channel, destination: check.destination });
    }
    return plans;
  }

  private async findDeliveryOrThrow(id: string): Promise<DeliveryRecord> {
    const row = await this.deliveryRepository.findById(id);
    if (row === null) {
      throw new NotFoundException('Delivery not found');
    }
    return row;
  }

  private async auditRequested(row: DeliveryRecord, currentUser: CurrentUser): Promise<void> {
    await this.auditService.record({
      action: AuditAction.DELIVERY_REQUESTED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: row.id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: {
        channel: row.channel,
        shape: row.shape,
        invoiceId: row.invoiceId,
        invoiceDocumentId: row.invoiceDocumentId,
        destinationMasked: row.destinationMasked,
      },
    });
  }
}

/** FR-E4-02: ISSUED or PAID, and a READY snapshot. Returns the snapshot. */
function assertDeliverable(
  subject: InvoiceDeliverySubjectRecord,
): NonNullable<InvoiceDeliverySubjectRecord['document']> {
  if (!DELIVERABLE_INVOICE_STATUSES.has(subject.invoice.status)) {
    throw new ConflictException({
      message: 'Only an issued or paid invoice can be sent to the patient',
      code: INVOICE_NOT_DELIVERABLE_CODE,
      errors: { status: subject.invoice.status },
    });
  }
  const document = subject.document;
  if (document === null || document.status !== 'READY' || document.storageKey === null) {
    throw new ConflictException({
      message: 'The invoice document has not been rendered yet. Render it, then send.',
      code: INVOICE_DOCUMENT_NOT_READY_CODE,
      errors: { documentStatus: document?.status ?? null },
    });
  }
  return document;
}

function assertQueued(row: DeliveryRecord, message: string): void {
  if (row.status !== 'QUEUED') {
    throw new ConflictException({
      message,
      code: DELIVERY_NOT_SCHEDULABLE_CODE,
      errors: { status: row.status },
    });
  }
}

/**
 * A scheduled time must be ahead of now (FR-E4-09): a `sendAt` in the past
 * is a typo, not an instruction to send immediately, and the worker would
 * otherwise silently treat it as one.
 */
function resolveSendAt(sendAt: string | undefined): Date | null {
  if (sendAt === undefined) {
    return null;
  }
  const parsed = new Date(sendAt);
  if (parsed.getTime() <= Date.now()) {
    throw new UnprocessableEntityException({
      message: 'The scheduled time must be in the future',
      code: DELIVERY_SEND_AT_IN_PAST_CODE,
      errors: { sendAt },
    });
  }
  return parsed;
}

function resolveRevocableStatuses(shape: DeliveryShapeValue): readonly DeliveryStatusValue[] {
  return shape === 'LINK'
    ? [...REVOCABLE_BEFORE_SEND, ...REVOCABLE_AFTER_SEND_AS_LINK]
    : REVOCABLE_BEFORE_SEND;
}

function buildCreateData(params: {
  subject: InvoiceDeliverySubjectRecord;
  documentId: string;
  plan: PlannedDelivery;
  shape: DeliveryShapeValue;
  passwordSource: DeliveryPasswordSourceValue | null;
  sendAt: Date | null;
  currentUser: CurrentUser;
}): CreateDeliveryData {
  return {
    patientId: params.subject.invoice.patientId,
    invoiceId: params.subject.invoice.id,
    invoiceDocumentId: params.documentId,
    documentId: null,
    channel: params.plan.channel,
    shape: params.shape,
    destinationMasked: maskDeliveryDestination(params.plan.destination),
    passwordSource: params.passwordSource,
    requestedById: params.currentUser.sub,
    sendAt: params.sendAt,
  };
}
