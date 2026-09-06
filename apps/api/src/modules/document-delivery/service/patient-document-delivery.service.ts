import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ClinicalDeliverySubjectRecord,
  ClinicalDispatchRefusal,
  ClinicalDispatchResult,
  CreateDeliveryData,
  DeliveryChannelValue,
  DeliveryDestination,
  DeliveryRecord,
  DocumentCategoryValue,
  DocumentDeliveryConfig,
  PatientDocumentDeliveryTimelineView,
  RequestClinicalDispatchInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliveryPasswordService } from './delivery-password.service';
import { maskDeliveryDestination } from './mask-delivery-destination';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import { toDeliveryView } from './to-delivery-view';
import { isDeliverableClinicalMimeType } from './wrap-image-in-pdf';

const DELIVERY_AUDIT_RESOURCE = 'DocumentDelivery';

export const DOCUMENT_NOT_RELEASED_CODE = 'DOCUMENT_NOT_RELEASED';

type PlannedDelivery = { channel: DeliveryChannelValue; destination: DeliveryDestination };

/**
 * Dispatching a released clinical document to its patient (`P16-T40`,
 * FR-E4-24/26/27/28) — the patient's end of dual delivery (§7.4.5).
 *
 * Called by the document module's release, and by nothing else: the one
 * precondition this service checks itself is that the document *is*
 * released, so no upload path, no edit path and no future caller can put a
 * clinical file on WhatsApp without a clinician's release having happened
 * first (FR-E4-26).
 *
 * Unlike an invoice send, a refusal here is per channel and never fatal.
 * The release is the clinical act and it has already happened; a patient
 * who withdrew WhatsApp consent, or has no date of birth to lock the file
 * with, is reported as a refused channel on the response — the doctor is
 * still notified, the document is still in the panel — rather than turning
 * the release into an error.
 *
 * Nothing is sent here. Rows go in QUEUED and the worker (`P16-T26`) sends
 * them through the same gates, the same lock and the same timeline an
 * invoice uses (D-028).
 */
@Injectable()
export class PatientDocumentDeliveryService {
  private readonly deliveryConfig: DocumentDeliveryConfig;

  constructor(
    configService: ConfigService,
    private readonly deliveryRepository: DocumentDeliveryRepository,
    private readonly consentService: PatientDeliveryConsentService,
    private readonly passwordService: DeliveryPasswordService,
    private readonly auditService: AuditService,
  ) {
    this.deliveryConfig = resolveDocumentDeliveryConfig(configService);
  }

  /** FR-E4-28: whether a category's release pre-selects dispatch. */
  isDispatchByDefault(category: DocumentCategoryValue): boolean {
    return this.deliveryConfig.dispatchDefaultCategories.includes(category);
  }

  async requestDispatch(
    documentId: string,
    input: RequestClinicalDispatchInput,
    currentUser: CurrentUser,
  ): Promise<ClinicalDispatchResult> {
    const subject = await this.findSubjectOrThrow(documentId);
    if (!subject.document.releasedToPatient || subject.document.isDeleted) {
      throw new UnprocessableEntityException({
        message: 'Only a released document can be sent to the patient',
        code: DOCUMENT_NOT_RELEASED_CODE,
      });
    }
    const blanketRefusal = this.resolveBlanketRefusal(subject);
    if (blanketRefusal !== null) {
      return {
        deliveries: [],
        refused: input.channels.map((channel) => ({ channel, refusalReason: blanketRefusal })),
      };
    }
    const { plans, refused } = await this.planChannels(subject, input.channels, currentUser);
    if (plans.length === 0) {
      return { deliveries: [], refused };
    }
    const rows = await this.deliveryRepository.createMany(
      plans.map((plan) => buildCreateData(subject, plan, this.passwordService, currentUser)),
    );
    await Promise.all(rows.map((row) => this.auditRequested(row, subject, currentUser)));
    return { deliveries: rows, refused };
  }

  async listForDocument(documentId: string): Promise<PatientDocumentDeliveryTimelineView> {
    const subject = await this.findSubjectOrThrow(documentId);
    const rows = await this.deliveryRepository.findByDocument(documentId);
    return {
      documentId,
      category: subject.document.category,
      isDispatchByDefault: this.isDispatchByDefault(subject.document.category),
      deliveries: rows.map(toDeliveryView),
    };
  }

  /**
   * The refusals that apply whatever the channel: a file that cannot be
   * locked because there is nothing to lock it with (FR-E4-07), or one that
   * is not a PDF or an image and so cannot become a locked PDF at all.
   */
  private resolveBlanketRefusal(
    subject: ClinicalDeliverySubjectRecord,
  ): ClinicalDispatchRefusal['refusalReason'] | null {
    if (!isDeliverableClinicalMimeType(subject.document.mimeType)) {
      return 'FORMAT_NOT_DELIVERABLE';
    }
    try {
      this.passwordService.assertPasswordAvailable(subject.patient);
    } catch {
      return 'DATE_OF_BIRTH_MISSING';
    }
    return null;
  }

  private async planChannels(
    subject: ClinicalDeliverySubjectRecord,
    channels: readonly DeliveryChannelValue[],
    currentUser: CurrentUser,
  ): Promise<{ plans: PlannedDelivery[]; refused: ClinicalDispatchRefusal[] }> {
    const plans: PlannedDelivery[] = [];
    const refused: ClinicalDispatchRefusal[] = [];
    for (const channel of channels) {
      const check = await this.consentService.isDeliveryAllowed(
        { patientId: subject.patient.id, channel },
        currentUser.sub,
      );
      if (!check.isAllowed || check.destination === null) {
        refused.push({ channel, refusalReason: check.refusalReason ?? 'CONSENT_MISSING' });
        continue;
      }
      plans.push({ channel, destination: check.destination });
    }
    return { plans, refused };
  }

  private async findSubjectOrThrow(documentId: string): Promise<ClinicalDeliverySubjectRecord> {
    const subject = await this.deliveryRepository.findClinicalDeliverySubject(documentId);
    if (subject === null) {
      throw new NotFoundException('Document not found');
    }
    return subject;
  }

  private async auditRequested(
    row: DeliveryRecord,
    subject: ClinicalDeliverySubjectRecord,
    currentUser: CurrentUser,
  ): Promise<void> {
    await this.auditService.record({
      action: AuditAction.DELIVERY_REQUESTED,
      resource: DELIVERY_AUDIT_RESOURCE,
      resourceId: row.id,
      actorUserId: currentUser.sub,
      patientId: row.patientId,
      metadata: {
        channel: row.channel,
        shape: row.shape,
        documentId: row.documentId,
        category: subject.document.category,
        destinationMasked: row.destinationMasked,
      },
    });
  }
}

/** One QUEUED attachment row per allowed channel — a result never leaves as a link (D-027). */
function buildCreateData(
  subject: ClinicalDeliverySubjectRecord,
  plan: PlannedDelivery,
  passwordService: DeliveryPasswordService,
  currentUser: CurrentUser,
): CreateDeliveryData {
  return {
    patientId: subject.patient.id,
    invoiceId: null,
    invoiceDocumentId: null,
    documentId: subject.document.id,
    channel: plan.channel,
    shape: 'ATTACHMENT',
    destinationMasked: maskDeliveryDestination(plan.destination),
    passwordSource: passwordService.passwordSource,
    requestedById: currentUser.sub,
    sendAt: null,
  };
}
