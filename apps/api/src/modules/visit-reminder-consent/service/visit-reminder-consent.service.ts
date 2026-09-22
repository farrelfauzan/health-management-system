import { Injectable } from '@nestjs/common';

import {
  PatientVisitReminderConsentResponse,
  UpsertVisitReminderConsentInput,
  VISIT_REMINDER_CONSENT_PURPOSE,
  VisitReminderConsentRecord,
  VisitReminderConsentView,
  VisitReminderRecipientRecord,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { AuditAction } from '../../../generated/prisma/client';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { PatientVisitReminderConsentRepository } from '../repository/patient-visit-reminder-consent.repository';

const CONSENT_AUDIT_RESOURCE = 'PatientVisitReminderConsent';

/**
 * Consent to WhatsApp visit reminders (P25-T17, D-042): capture at the desk,
 * withdrawal at the desk or by the patient's own STOP / BERHENTI, and the
 * one question the reminder worker asks.
 *
 * **Deny by default**, like delivery consent: no row means she was never
 * asked, and nothing is sent. Consent is recorded against the privacy notice
 * in force at capture, read server-side — the patient agreed to what she was
 * shown, not to whatever a request names.
 */
@Injectable()
export class VisitReminderConsentService {
  constructor(
    private readonly consentRepository: PatientVisitReminderConsentRepository,
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
    private readonly patientManagementService: PatientManagementService,
    private readonly auditService: AuditService,
  ) {}

  /** Scoped through the patient read: outside the caller's reach is a 404 here too. */
  async getConsent(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<PatientVisitReminderConsentResponse> {
    await this.patientManagementService.getPatientById(patientId, currentUser);
    return this.buildResponse(patientId, await this.consentRepository.findByPatient(patientId));
  }

  async upsertConsent(
    patientId: string,
    input: UpsertVisitReminderConsentInput,
    currentUser: CurrentUser,
  ): Promise<PatientVisitReminderConsentResponse> {
    await this.patientManagementService.getPatientById(patientId, currentUser);
    const record = input.isGranted
      ? await this.grant(patientId, currentUser)
      : await this.withdraw(patientId, currentUser);
    return this.buildResponse(patientId, record);
  }

  /**
   * The patient's STOP / BERHENTI (FR-E4-16), called by the existing inbound
   * opt-out handler for every patient the chat is proven for. No actor: the
   * patient did this.
   */
  async revokeByPatientKeyword(patientIds: readonly string[], revokedAt: Date): Promise<void> {
    for (const patientId of patientIds) {
      await this.consentRepository.revoke({
        patientId,
        revokedReason: 'PATIENT_KEYWORD',
        revokedAt,
      });
      await this.auditService.record({
        action: AuditAction.VISIT_REMINDER_CONSENT_OPTED_OUT,
        resource: CONSENT_AUDIT_RESOURCE,
        patientId,
        metadata: { purpose: VISIT_REMINDER_CONSENT_PURPOSE, revokedReason: 'PATIENT_KEYWORD' },
      });
    }
  }

  /** Of these patients, the ones who have consented right now. */
  async listConsentedPatientIds(patientIds: readonly string[]): Promise<string[]> {
    return this.consentRepository.listGrantedPatientIds(patientIds);
  }

  /** The consenting patients among these, with the contact fields the send gate reads. */
  async listConsentedRecipients(
    patientIds: readonly string[],
  ): Promise<VisitReminderRecipientRecord[]> {
    return this.consentRepository.listGrantedRecipients(patientIds);
  }

  private async grant(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<VisitReminderConsentRecord> {
    const noticeVersion = await this.privacyNoticeRepository.findCurrentVersion();
    const record = await this.consentRepository.grant({
      patientId,
      noticeVersionId: noticeVersion?.id ?? null,
      grantedById: currentUser.sub,
      grantedAt: new Date(),
    });
    await this.auditService.record({
      action: AuditAction.VISIT_REMINDER_CONSENT_GRANTED,
      resource: CONSENT_AUDIT_RESOURCE,
      actorUserId: currentUser.sub,
      patientId,
      metadata: {
        purpose: VISIT_REMINDER_CONSENT_PURPOSE,
        noticeVersionId: noticeVersion?.id ?? null,
      },
    });
    return record;
  }

  private async withdraw(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<VisitReminderConsentRecord> {
    const record = await this.consentRepository.revoke({
      patientId,
      revokedReason: 'STAFF',
      revokedAt: new Date(),
    });
    await this.auditService.record({
      action: AuditAction.VISIT_REMINDER_CONSENT_WITHDRAWN,
      resource: CONSENT_AUDIT_RESOURCE,
      actorUserId: currentUser.sub,
      patientId,
      metadata: { purpose: VISIT_REMINDER_CONSENT_PURPOSE, revokedReason: 'STAFF' },
    });
    return record;
  }

  private buildResponse(
    patientId: string,
    record: VisitReminderConsentRecord | null,
  ): PatientVisitReminderConsentResponse {
    return { patientId, consent: record === null ? null : toConsentView(record) };
  }
}

function toConsentView(record: VisitReminderConsentRecord): VisitReminderConsentView {
  return {
    purpose: VISIT_REMINDER_CONSENT_PURPOSE,
    isGranted: record.isGranted,
    noticeVersion: record.noticeVersion,
    grantedAt: record.grantedAt?.toISOString() ?? null,
    grantedBy: record.grantedBy,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    revokedReason: record.revokedReason,
  };
}
