import { Injectable, NotFoundException } from '@nestjs/common';

import {
  DELIVERY_CHANNELS,
  DeliveryChannelReadinessView,
  DeliveryChannelValue,
  DeliveryConsentCheckInput,
  DeliveryConsentCheckResult,
  DeliveryDestination,
  DeliveryGatePatientRecord,
  DeliveryRefusalReasonValue,
  PatientDeliveryConsentRecord,
  PatientDeliveryConsentView,
  PatientDeliveryConsentsView,
  UpsertPatientDeliveryConsentInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { AuditAction } from '../../../generated/prisma/client';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { DeliveryGateRepository } from '../repository/delivery-gate.repository';
import { PatientDeliveryConsentRepository } from '../repository/patient-delivery-consent.repository';
import { DeliveryChannelGateService } from './delivery-channel-gate.service';

const CONSENT_AUDIT_RESOURCE = 'PatientDeliveryConsent';

/**
 * Delivery consent (`P16-T24`, FR-E4-04): capture, withdrawal, and the one
 * question the send pipeline asks.
 *
 * **Deny by default.** A patient with no row has not consented; a row with
 * `isGranted = false` has said no. The pipeline (`P16-T25`/`T26`) calls
 * {@link isDeliveryAllowed} at send time — not at scheduling time
 * (FR-E4-10) — and a `false` here is final whatever the send dialog showed
 * when the clerk clicked.
 *
 * Consent is recorded against the privacy notice in force *at capture*, read
 * server-side rather than taken from the request: the patient agreed to what
 * they were shown, and the version they were shown is whatever was current
 * when the clerk pressed the button.
 */
@Injectable()
export class PatientDeliveryConsentService {
  constructor(
    private readonly consentRepository: PatientDeliveryConsentRepository,
    private readonly gateRepository: DeliveryGateRepository,
    private readonly gateService: DeliveryChannelGateService,
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
    private readonly patientManagementService: PatientManagementService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Per-channel state for the patient record and the send dialog. Scoped
   * through the patient read: a record outside the actor's reach is a 404
   * here for the same reason it is one on the patient route.
   */
  async listConsents(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<PatientDeliveryConsentsView> {
    await this.patientManagementService.getPatientById(patientId, currentUser);
    return this.buildView(patientId);
  }

  async upsertConsent(
    patientId: string,
    input: UpsertPatientDeliveryConsentInput,
    currentUser: CurrentUser,
  ): Promise<PatientDeliveryConsentsView> {
    await this.patientManagementService.getPatientById(patientId, currentUser);
    const now = new Date();
    if (input.isGranted) {
      const noticeVersion = await this.privacyNoticeRepository.findCurrentVersion();
      await this.consentRepository.grant({
        patientId,
        channel: input.channel,
        noticeVersionId: noticeVersion?.id ?? null,
        grantedById: currentUser.sub,
        grantedAt: now,
      });
      await this.auditService.record({
        action: AuditAction.DELIVERY_CONSENT_GRANTED,
        resource: CONSENT_AUDIT_RESOURCE,
        actorUserId: currentUser.sub,
        patientId,
        metadata: { channel: input.channel, noticeVersionId: noticeVersion?.id ?? null },
      });
    } else {
      await this.consentRepository.revoke({
        patientId,
        channel: input.channel,
        revokedReason: 'STAFF',
        revokedAt: now,
      });
      await this.auditService.record({
        action: AuditAction.DELIVERY_CONSENT_WITHDRAWN,
        resource: CONSENT_AUDIT_RESOURCE,
        actorUserId: currentUser.sub,
        patientId,
        metadata: { channel: input.channel, revokedReason: 'STAFF' },
      });
    }
    return this.buildView(patientId);
  }

  /**
   * The send-time check (FR-E4-03/04/10), for the delivery pipeline.
   *
   * Consent is asked first: a patient who has not agreed is refused before
   * the channel is even looked at. The wrong-patient refusal is audited here
   * and only here — it is evidence of an attempt to send to a number proven
   * for somebody else, and the readiness view the patient page renders is
   * not an attempt.
   *
   * An allowed result carries the destination the send goes to — the
   * verified link's JID, or the email on the record — so the pipeline never
   * resolves it a second way (`P16-T25`).
   */
  async isDeliveryAllowed(
    input: DeliveryConsentCheckInput,
    actorUserId: string | null = null,
  ): Promise<DeliveryConsentCheckResult> {
    const patient = await this.gateRepository.findPatientContact(input.patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    const consent = await this.consentRepository.findOne(input.patientId, input.channel);
    const consentRefusal = resolveConsentRefusal(consent);
    if (consentRefusal !== null) {
      return { isAllowed: false, refusalReason: consentRefusal, destination: null };
    }
    if (input.channel === 'EMAIL') {
      return buildEmailCheckResult(patient, this.gateService.resolveEmailGate(patient));
    }
    const gate = await this.gateService.resolveWhatsappGate(patient);
    if (gate.refusalReason === 'NUMBER_VERIFIED_FOR_ANOTHER_PATIENT') {
      await this.auditService.record({
        action: AuditAction.DELIVERY_CHANNEL_REFUSED,
        resource: CONSENT_AUDIT_RESOURCE,
        actorUserId,
        patientId: input.patientId,
        metadata: { channel: input.channel, refusalReason: gate.refusalReason },
      });
    }
    const destination: DeliveryDestination | null =
      gate.link === null
        ? null
        : {
            channel: 'WHATSAPP',
            externalChatId: gate.link.externalChatId,
            phoneNumber: gate.link.phoneNumber,
          };
    return { isAllowed: gate.isAllowed, refusalReason: gate.refusalReason, destination };
  }

  private async buildView(patientId: string): Promise<PatientDeliveryConsentsView> {
    const patient = await this.gateRepository.findPatientContact(patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    const consents = await this.consentRepository.findByPatient(patientId);
    const channels = await Promise.all(
      DELIVERY_CHANNELS.map((channel) =>
        this.buildReadiness(
          patient,
          channel,
          consents.find((consent) => consent.channel === channel) ?? null,
        ),
      ),
    );
    return { patientId, channels };
  }

  private async buildReadiness(
    patient: DeliveryGatePatientRecord,
    channel: DeliveryChannelValue,
    consent: PatientDeliveryConsentRecord | null,
  ): Promise<DeliveryChannelReadinessView> {
    const refusalReason =
      resolveConsentRefusal(consent) ?? (await this.resolveChannelRefusal(patient, channel));
    return {
      channel,
      consent: consent === null ? null : toConsentView(consent),
      isDeliveryAllowed: refusalReason === null,
      refusalReason,
    };
  }

  private async resolveChannelRefusal(
    patient: DeliveryGatePatientRecord,
    channel: DeliveryChannelValue,
  ): Promise<DeliveryRefusalReasonValue | null> {
    if (channel === 'EMAIL') {
      return this.gateService.resolveEmailGate(patient);
    }
    const gate = await this.gateService.resolveWhatsappGate(patient);
    return gate.refusalReason;
  }
}

function buildEmailCheckResult(
  patient: DeliveryGatePatientRecord,
  refusalReason: DeliveryRefusalReasonValue | null,
): DeliveryConsentCheckResult {
  if (refusalReason !== null || patient.email === null) {
    return { isAllowed: false, refusalReason: refusalReason ?? 'EMAIL_MISSING', destination: null };
  }
  return {
    isAllowed: true,
    refusalReason: null,
    destination: { channel: 'EMAIL', email: patient.email.trim() },
  };
}

function resolveConsentRefusal(
  consent: PatientDeliveryConsentRecord | null,
): DeliveryRefusalReasonValue | null {
  if (consent === null) {
    return 'CONSENT_MISSING';
  }
  return consent.isGranted ? null : 'CONSENT_REVOKED';
}

function toConsentView(consent: PatientDeliveryConsentRecord): PatientDeliveryConsentView {
  return {
    channel: consent.channel,
    isGranted: consent.isGranted,
    noticeVersion: consent.noticeVersion,
    grantedAt: consent.grantedAt?.toISOString() ?? null,
    grantedBy: consent.grantedBy,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
    revokedReason: consent.revokedReason,
  };
}
