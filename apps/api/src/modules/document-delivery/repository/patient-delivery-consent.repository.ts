import { Injectable } from '@nestjs/common';

import {
  consentRevokedReasonSchema,
  GrantDeliveryConsentData,
  PatientDeliveryConsentRecord,
  RevokeDeliveryConsentData,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

/**
 * The row shape every query in this file selects, so a future column cannot
 * leak through a `select`-less read.
 */
const CONSENT_SELECT = {
  id: true,
  patientId: true,
  channel: true,
  isGranted: true,
  grantedAt: true,
  revokedAt: true,
  revokedReason: true,
  noticeVersion: { select: { id: true, version: true } },
  grantedBy: { select: { id: true, email: true } },
} satisfies Prisma.PatientDeliveryConsentSelect;

type ConsentRow = Prisma.PatientDeliveryConsentGetPayload<{ select: typeof CONSENT_SELECT }>;

/**
 * Persistence for delivery consent (`P16-T24`, FR-E4-04).
 *
 * Both writes are upserts on `(patientId, channel)`: the row is the current
 * answer to "may this patient receive on this channel", and a withdrawal
 * rewrites it rather than deleting it so the fact that consent was withdrawn
 * — by whom, when — is what the row then says.
 */
@Injectable()
export class PatientDeliveryConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPatient(patientId: string): Promise<PatientDeliveryConsentRecord[]> {
    const rows = await this.prisma.patientDeliveryConsent.findMany({
      where: { patientId },
      orderBy: { channel: 'asc' },
      select: CONSENT_SELECT,
    });
    return rows.map(toRecord);
  }

  async findOne(
    patientId: string,
    channel: PatientDeliveryConsentRecord['channel'],
  ): Promise<PatientDeliveryConsentRecord | null> {
    const row = await this.prisma.patientDeliveryConsent.findUnique({
      where: { patientId_channel: { patientId, channel } },
      select: CONSENT_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  /**
   * Capture. A re-grant after a withdrawal clears the revocation fields —
   * the patient changed their mind at the counter, and the row must not read
   * as both granted and revoked.
   */
  async grant(data: GrantDeliveryConsentData): Promise<PatientDeliveryConsentRecord> {
    const row = await this.prisma.patientDeliveryConsent.upsert({
      where: { patientId_channel: { patientId: data.patientId, channel: data.channel } },
      create: {
        patientId: data.patientId,
        channel: data.channel,
        isGranted: true,
        noticeVersionId: data.noticeVersionId,
        grantedAt: data.grantedAt,
        grantedById: data.grantedById,
      },
      update: {
        isGranted: true,
        noticeVersionId: data.noticeVersionId,
        grantedAt: data.grantedAt,
        grantedById: data.grantedById,
        revokedAt: null,
        revokedReason: null,
      },
      select: CONSENT_SELECT,
    });
    return toRecord(row);
  }

  /**
   * Withdrawal. Creates a revoked row where none existed: a patient who sent
   * `BERHENTI` before anyone captured consent has still said no, and the
   * counter must see that rather than an empty form.
   */
  async revoke(data: RevokeDeliveryConsentData): Promise<PatientDeliveryConsentRecord> {
    const row = await this.prisma.patientDeliveryConsent.upsert({
      where: { patientId_channel: { patientId: data.patientId, channel: data.channel } },
      create: {
        patientId: data.patientId,
        channel: data.channel,
        isGranted: false,
        revokedAt: data.revokedAt,
        revokedReason: data.revokedReason,
      },
      update: {
        isGranted: false,
        revokedAt: data.revokedAt,
        revokedReason: data.revokedReason,
      },
      select: CONSENT_SELECT,
    });
    return toRecord(row);
  }
}

function toRecord(row: ConsentRow): PatientDeliveryConsentRecord {
  const parsedReason = consentRevokedReasonSchema.safeParse(row.revokedReason);
  return {
    id: row.id,
    patientId: row.patientId,
    channel: row.channel,
    isGranted: row.isGranted,
    noticeVersion: row.noticeVersion,
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy,
    revokedAt: row.revokedAt,
    revokedReason: parsedReason.success ? parsedReason.data : null,
  };
}
