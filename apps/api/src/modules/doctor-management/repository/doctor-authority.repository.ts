import {
  CreateDoctorAuthorityRecordPayload,
  DoctorAuthorityClinicianRecord,
  DoctorAuthorityExpiryRecord,
  DoctorAuthorityKindValue,
  DoctorAuthorityRecord,
  RevokeDoctorAuthorityRecordPayload,
  UpdateDoctorAuthorityRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { DoctorAuthorityConflictError } from './doctor-authority-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const AUTHORITY_SELECT = {
  id: true,
  doctorId: true,
  kind: true,
  trainingCertificateNumber: true,
  decreeNumber: true,
  decreeIssuedAt: true,
  validFrom: true,
  validUntil: true,
  decreeStorageKey: true,
  decreeMimeType: true,
  decreeSizeBytes: true,
  revokedAt: true,
  revokedById: true,
  revokeReason: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.DoctorAuthoritySelect;

function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  return (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE;
}

/**
 * Translates the partial-index race — two grants of one kind both passing
 * the service pre-check — into the conflict the pre-check raises. The only
 * unique index on the table is that one, so the code alone identifies it.
 */
function rethrowAuthorityConflict(err: unknown): never {
  if (isUniqueConstraintError(err)) {
    throw new DoctorAuthorityConflictError();
  }
  throw err;
}

function toDecreeColumns(decree: UpdateDoctorAuthorityRecordPayload['decree']): {
  decreeStorageKey?: string | null;
  decreeMimeType?: string | null;
  decreeSizeBytes?: number | null;
} {
  if (decree === undefined) {
    return {};
  }
  return {
    decreeStorageKey: decree?.storageKey ?? null,
    decreeMimeType: decree?.mimeType ?? null,
    decreeSizeBytes: decree?.sizeBytes ?? null,
  };
}

/**
 * Persistence for a midwife's delegated authorities (P25-T02). The one
 * Prisma reader for `doctor_authorities`; every other module reaches these
 * rows through `DoctorAuthorityService`.
 */
@Injectable()
export class DoctorAuthorityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The clinician a grant is for, or null when no live profile exists. */
  async findClinicianById(doctorId: string): Promise<DoctorAuthorityClinicianRecord | null> {
    return this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, deletedAt: null },
      select: { id: true, fullName: true, profession: true },
    });
  }

  /** Every undeleted authority of one clinician, live rows first. */
  async listByDoctor(doctorId: string): Promise<DoctorAuthorityRecord[]> {
    return this.prisma.doctorAuthority.findMany({
      where: { doctorId, deletedAt: null },
      select: AUTHORITY_SELECT,
      orderBy: [
        { revokedAt: { sort: 'asc', nulls: 'first' } },
        { validFrom: 'desc' },
        { id: 'asc' },
      ],
    });
  }

  async findById(doctorId: string, id: string): Promise<DoctorAuthorityRecord | null> {
    return this.prisma.doctorAuthority.findFirst({
      where: { id, doctorId, deletedAt: null },
      select: AUTHORITY_SELECT,
    });
  }

  /** Whether a live (unrevoked, undeleted) row of this kind exists, dates aside. */
  async hasLiveAuthority(doctorId: string, kind: DoctorAuthorityKindValue): Promise<boolean> {
    const count = await this.prisma.doctorAuthority.count({
      where: { doctorId, kind, revokedAt: null, deletedAt: null },
    });
    return count > 0;
  }

  /**
   * Whether a live row of this kind covers `onDate`: `valid_from ≤ onDate`
   * and `valid_until` null or `≥ onDate`, both inclusive.
   */
  async hasActiveAuthority(
    doctorId: string,
    kind: DoctorAuthorityKindValue,
    onDate: Date,
  ): Promise<boolean> {
    const count = await this.prisma.doctorAuthority.count({
      where: {
        doctorId,
        kind,
        revokedAt: null,
        deletedAt: null,
        validFrom: { lte: onDate },
        OR: [{ validUntil: null }, { validUntil: { gte: onDate } }],
      },
    });
    return count > 0;
  }

  async create(payload: CreateDoctorAuthorityRecordPayload): Promise<DoctorAuthorityRecord> {
    try {
      return await this.prisma.doctorAuthority.create({
        data: {
          doctorId: payload.doctorId,
          kind: payload.kind,
          trainingCertificateNumber: payload.trainingCertificateNumber,
          decreeNumber: payload.decreeNumber,
          decreeIssuedAt: payload.decreeIssuedAt,
          validFrom: payload.validFrom,
          validUntil: payload.validUntil,
          createdById: payload.createdById,
          ...toDecreeColumns(payload.decree),
        },
        select: AUTHORITY_SELECT,
      });
    } catch (err) {
      rethrowAuthorityConflict(err);
    }
  }

  async update(
    id: string,
    payload: UpdateDoctorAuthorityRecordPayload,
  ): Promise<DoctorAuthorityRecord> {
    return this.prisma.doctorAuthority.update({
      where: { id },
      data: {
        trainingCertificateNumber: payload.trainingCertificateNumber,
        decreeNumber: payload.decreeNumber,
        decreeIssuedAt: payload.decreeIssuedAt,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
        ...toDecreeColumns(payload.decree),
      },
      select: AUTHORITY_SELECT,
    });
  }

  async revoke(
    id: string,
    payload: RevokeDoctorAuthorityRecordPayload,
  ): Promise<DoctorAuthorityRecord> {
    return this.prisma.doctorAuthority.update({
      where: { id },
      data: {
        revokedAt: payload.revokedAt,
        revokedById: payload.revokedById,
        revokeReason: payload.revokeReason,
      },
      select: AUTHORITY_SELECT,
    });
  }

  /**
   * Every live authority whose end date is on or before `throughDate`,
   * soonest first, for the reminder sweep. Open-ended rows have nothing to
   * reach and are excluded; so are revoked rows, soft-deleted rows and rows
   * of retired clinicians — the list is of obligations the clinic still has.
   */
  async listExpiringAuthorities(throughDate: Date): Promise<DoctorAuthorityExpiryRecord[]> {
    const rows = await this.prisma.doctorAuthority.findMany({
      where: {
        deletedAt: null,
        revokedAt: null,
        validUntil: { not: null, lte: throughDate },
        doctor: { deletedAt: null, isActive: true },
      },
      select: {
        id: true,
        doctorId: true,
        kind: true,
        decreeNumber: true,
        validUntil: true,
        doctor: { select: { fullName: true } },
      },
      orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      authorityId: row.id,
      doctorId: row.doctorId,
      doctorName: row.doctor.fullName,
      kind: row.kind,
      decreeNumber: row.decreeNumber,
      // Narrowing what the `not: null` predicate already guarantees.
      validUntil: row.validUntil as Date,
    }));
  }

  /**
   * Records that this authority has been announced at this threshold. The
   * unique index decides; returns whether this call inserted, so the caller
   * notifies exactly once.
   */
  async claimExpiryNotice(authorityId: string, thresholdDays: number): Promise<boolean> {
    const result = await this.prisma.doctorAuthorityExpiryNotice.createMany({
      data: [{ authorityId, thresholdDays }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }
}
