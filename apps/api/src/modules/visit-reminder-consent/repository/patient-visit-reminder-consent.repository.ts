import { Injectable } from '@nestjs/common';

import {
  consentRevokedReasonSchema,
  GrantVisitReminderConsentData,
  resolveUserDisplayName,
  RevokeVisitReminderConsentData,
  VisitReminderConsentRecord,
  VisitReminderRecipientRecord,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { USER_DISPLAY_NAME_SELECT } from '../../../common/prisma/user-display-name-select';
import { Prisma } from '../../../generated/prisma/client';

const CONSENT_SELECT = {
  patientId: true,
  isGranted: true,
  grantedAt: true,
  revokedAt: true,
  revokedReason: true,
  noticeVersion: { select: { id: true, version: true } },
  grantedBy: { select: { id: true, ...USER_DISPLAY_NAME_SELECT } },
} satisfies Prisma.PatientVisitReminderConsentSelect;

type ConsentRow = Prisma.PatientVisitReminderConsentGetPayload<{ select: typeof CONSENT_SELECT }>;

/**
 * Persistence for visit-reminder consent (P25-T17, D-042) — its own table,
 * never `patient_delivery_consents`. One row per patient, upserted: the row
 * is the current answer, and a withdrawal rewrites it so it then says who
 * withdrew it and when.
 */
@Injectable()
export class PatientVisitReminderConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPatient(patientId: string): Promise<VisitReminderConsentRecord | null> {
    const row = await this.prisma.patientVisitReminderConsent.findUnique({
      where: { patientId },
      select: CONSENT_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  /** Of these patients, the ones whose consent is currently granted. */
  async listGrantedPatientIds(patientIds: readonly string[]): Promise<string[]> {
    if (patientIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.patientVisitReminderConsent.findMany({
      where: { patientId: { in: [...patientIds] }, isGranted: true },
      select: { patientId: true },
    });
    return rows.map((row) => row.patientId);
  }

  /**
   * Of these patients, the consenting ones who still exist, with the contact
   * fields the verified-number gate reads.
   */
  async listGrantedRecipients(
    patientIds: readonly string[],
  ): Promise<VisitReminderRecipientRecord[]> {
    if (patientIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.patientVisitReminderConsent.findMany({
      where: {
        patientId: { in: [...patientIds] },
        isGranted: true,
        patient: { deletedAt: null },
      },
      select: { patient: { select: { id: true, phoneNumber: true, email: true } } },
    });
    return rows.map((row) => row.patient);
  }

  /** Capture. A re-grant clears the revocation so the row never reads as both. */
  async grant(data: GrantVisitReminderConsentData): Promise<VisitReminderConsentRecord> {
    const fields = {
      isGranted: true,
      noticeVersionId: data.noticeVersionId,
      grantedAt: data.grantedAt,
      grantedById: data.grantedById,
    };
    const row = await this.prisma.patientVisitReminderConsent.upsert({
      where: { patientId: data.patientId },
      create: { patientId: data.patientId, ...fields },
      update: { ...fields, revokedAt: null, revokedReason: null },
      select: CONSENT_SELECT,
    });
    return toRecord(row);
  }

  /**
   * Withdrawal. Creates a revoked row where none existed: a patient who sent
   * BERHENTI before anyone asked has still said no, and the counter must see
   * that rather than an empty toggle.
   */
  async revoke(data: RevokeVisitReminderConsentData): Promise<VisitReminderConsentRecord> {
    const fields = {
      isGranted: false,
      revokedAt: data.revokedAt,
      revokedReason: data.revokedReason,
    };
    const row = await this.prisma.patientVisitReminderConsent.upsert({
      where: { patientId: data.patientId },
      create: { patientId: data.patientId, ...fields },
      update: fields,
      select: CONSENT_SELECT,
    });
    return toRecord(row);
  }
}

function toRecord(row: ConsentRow): VisitReminderConsentRecord {
  const parsedReason = consentRevokedReasonSchema.safeParse(row.revokedReason);
  return {
    patientId: row.patientId,
    isGranted: row.isGranted,
    noticeVersion: row.noticeVersion,
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy
      ? {
          id: row.grantedBy.id,
          email: row.grantedBy.email,
          name: resolveUserDisplayName(row.grantedBy),
        }
      : null,
    revokedAt: row.revokedAt,
    revokedReason: parsedReason.success ? parsedReason.data : null,
  };
}
