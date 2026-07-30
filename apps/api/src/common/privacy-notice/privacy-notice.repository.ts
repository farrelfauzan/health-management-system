import { Injectable } from '@nestjs/common';
import {
  PatientPrivacyNoticeRecord,
  PrivacyNoticeEvidenceInput,
  PrivacyNoticeVersionRecord,
} from '@hms/shared-types';

import { PrismaService } from '../prisma/prisma.service';
import { PrismaTransactionClient } from '../prisma/prisma.types';

export class CurrentPrivacyNoticeEvidenceRequiredError extends Error {}

@Injectable()
export class PrivacyNoticeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentVersion(): Promise<PrivacyNoticeVersionRecord | null> {
    return this.prisma.privacyNoticeVersion.findFirst({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  async findPatientHistory(patientId: string): Promise<PatientPrivacyNoticeRecord[]> {
    const records = await this.prisma.patientPrivacyNoticeRecord.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      include: { version: { select: { version: true } } },
    });
    return records.map((record) => ({ ...record, version: record.version.version }));
  }

  async findCurrentPatientRecord(patientId: string): Promise<PatientPrivacyNoticeRecord | null> {
    const current = await this.findCurrentVersion();
    if (!current) {
      return null;
    }
    const record = await this.prisma.patientPrivacyNoticeRecord.findFirst({
      where: {
        patientId,
        privacyNoticeVersionId: current.id,
        outcome: { in: ['ACKNOWLEDGED', 'PROVIDED_ACKNOWLEDGEMENT_DECLINED'] },
      },
      orderBy: { recordedAt: 'desc' },
      include: { version: { select: { version: true } } },
    });
    return record ? { ...record, version: record.version.version } : null;
  }

  async captureCurrent(
    tx: PrismaTransactionClient,
    patientId: string,
    actorUserId: string,
    evidence: PrivacyNoticeEvidenceInput,
  ): Promise<void> {
    const version = await tx.privacyNoticeVersion.findFirst({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!version || version.id !== evidence.privacyNoticeVersionId) {
      throw new CurrentPrivacyNoticeEvidenceRequiredError(
        'Evidence must reference the current effective privacy notice',
      );
    }
    await tx.patientPrivacyNoticeRecord.create({
      data: {
        patientId,
        privacyNoticeVersionId: version.id,
        outcome: evidence.outcome,
        locale: evidence.locale,
        contentHash: evidence.locale === 'id' ? version.contentHashId : version.contentHashEn,
        subjectType: evidence.subjectType,
        representativeName: evidence.representativeName ?? null,
        representativeRelation: evidence.representativeRelation ?? null,
        actorUserId,
        provenance: evidence.provenance,
      },
    });
  }

  async assertCurrentEvidenceOrCapture(
    tx: PrismaTransactionClient,
    patientId: string,
    actorUserId: string,
    evidence?: PrivacyNoticeEvidenceInput,
  ): Promise<void> {
    const current = await tx.privacyNoticeVersion.findFirst({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
      select: { id: true },
    });
    if (!current) {
      throw new CurrentPrivacyNoticeEvidenceRequiredError('No current privacy notice is configured');
    }
    const existing = await tx.patientPrivacyNoticeRecord.findFirst({
      where: {
        patientId,
        privacyNoticeVersionId: current.id,
        outcome: { in: ['ACKNOWLEDGED', 'PROVIDED_ACKNOWLEDGEMENT_DECLINED'] },
      },
      select: { id: true },
    });
    if (existing) {
      return;
    }
    if (!evidence) {
      throw new CurrentPrivacyNoticeEvidenceRequiredError(
        'Current privacy notice acknowledgement outcome is required',
      );
    }
    await this.captureCurrent(tx, patientId, actorUserId, evidence);
  }
}
