import {
  CreateDoctorMandateRecordPayload,
  DoctorMandateRecord,
  FindCoveringDoctorMandateParams,
  RevokeDoctorMandateRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const MANDATE_SELECT = {
  id: true,
  midwifeDoctorId: true,
  mandatingDoctorId: true,
  kind: true,
  instruction: true,
  icd9cmCodes: true,
  validFrom: true,
  validUntil: true,
  instructionStorageKey: true,
  instructionMimeType: true,
  instructionSizeBytes: true,
  revokedAt: true,
  revokedById: true,
  revokeReason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  mandatingDoctor: { select: { fullName: true } },
} satisfies Prisma.DoctorMandateSelect;

type MandateRow = Prisma.DoctorMandateGetPayload<{ select: typeof MANDATE_SELECT }>;

/** Flattens the mandating doctor's name, which every view and card names. */
function toMandateRecord(row: MandateRow): DoctorMandateRecord {
  const { mandatingDoctor, ...record } = row;
  return { ...record, mandatingDoctorName: mandatingDoctor.fullName };
}

/**
 * Persistence for the written pelimpahan a midwife works under (P25-T05).
 * The one Prisma reader for `doctor_mandates`; the procedure gate reaches
 * these rows through `DoctorMandateService`, never here.
 */
@Injectable()
export class DoctorMandateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every undeleted mandate of one midwife, live rows first. */
  async listByMidwife(midwifeDoctorId: string): Promise<DoctorMandateRecord[]> {
    const rows = await this.prisma.doctorMandate.findMany({
      where: { midwifeDoctorId, deletedAt: null },
      select: MANDATE_SELECT,
      orderBy: [
        { revokedAt: { sort: 'asc', nulls: 'first' } },
        { validFrom: 'desc' },
        { id: 'asc' },
      ],
    });
    return rows.map((row) => toMandateRecord(row));
  }

  async findById(midwifeDoctorId: string, id: string): Promise<DoctorMandateRecord | null> {
    const row = await this.prisma.doctorMandate.findFirst({
      where: { id, midwifeDoctorId, deletedAt: null },
      select: MANDATE_SELECT,
    });
    return row === null ? null : toMandateRecord(row);
  }

  /**
   * The live mandate covering one procedure code on one day, if there is one
   * (P25-T05). Live means unrevoked, undeleted and `validFrom ≤ onDate ≤
   * validUntil`, both ends inclusive — the same rule an authority is judged
   * by, so a midwife never has to reason about two calendars.
   *
   * Oldest first, so a code covered by two overlapping mandates is attributed
   * to the one that was granted first rather than to whichever the database
   * happened to return: the earlier doctor is the one who asked for it.
   */
  async findCovering(params: FindCoveringDoctorMandateParams): Promise<DoctorMandateRecord | null> {
    const row = await this.prisma.doctorMandate.findFirst({
      where: {
        midwifeDoctorId: params.midwifeDoctorId,
        icd9cmCodes: { has: params.icd9cmCode },
        revokedAt: null,
        deletedAt: null,
        validFrom: { lte: params.onDate },
        validUntil: { gte: params.onDate },
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
      select: MANDATE_SELECT,
    });
    return row === null ? null : toMandateRecord(row);
  }

  /**
   * Live mandates whose window overlaps the one being granted. Read only to
   * warn (D-036 §3): overlapping pelimpahan are no longer refused, but an
   * administrator should see that one already exists.
   */
  async findOverlapping(params: {
    midwifeDoctorId: string;
    validFrom: Date;
    validUntil: Date;
  }): Promise<number> {
    return this.prisma.doctorMandate.count({
      where: {
        midwifeDoctorId: params.midwifeDoctorId,
        revokedAt: null,
        deletedAt: null,
        validFrom: { lte: params.validUntil },
        validUntil: { gte: params.validFrom },
      },
    });
  }

  async create(payload: CreateDoctorMandateRecordPayload): Promise<DoctorMandateRecord> {
    const row = await this.prisma.doctorMandate.create({
      data: {
        midwifeDoctorId: payload.midwifeDoctorId,
        mandatingDoctorId: payload.mandatingDoctorId,
        kind: payload.kind,
        instruction: payload.instruction,
        icd9cmCodes: payload.icd9cmCodes,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
        instructionStorageKey: payload.instructionDocument.storageKey,
        instructionMimeType: payload.instructionDocument.mimeType,
        instructionSizeBytes: payload.instructionDocument.sizeBytes,
        createdById: payload.createdById,
      },
      select: MANDATE_SELECT,
    });
    return toMandateRecord(row);
  }

  async revoke(
    id: string,
    payload: RevokeDoctorMandateRecordPayload,
  ): Promise<DoctorMandateRecord> {
    const row = await this.prisma.doctorMandate.update({
      where: { id },
      data: {
        revokedAt: payload.revokedAt,
        revokedById: payload.revokedById,
        revokeReason: payload.revokeReason,
      },
      select: MANDATE_SELECT,
    });
    return toMandateRecord(row);
  }
}
