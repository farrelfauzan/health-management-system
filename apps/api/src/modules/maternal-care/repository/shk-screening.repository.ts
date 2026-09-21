import { ShkResultPayload, ShkWorklistFilterValue, ShkWorklistQuery } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

/** A clinic's open worklist is short; this caps a runaway backlog, not a page. */
const SHK_WORKLIST_LIMIT = 200;

/** Everything a worklist row is read back with, in one shape. */
const SHK_SCREENING_INCLUDE = {
  sampleTakenBy: {
    select: { fullName: true, email: true, doctorProfile: { select: { fullName: true } } },
  },
  newbornCareRecord: {
    select: {
      id: true,
      sex: true,
      newbornPatientId: true,
      newbornPatient: { select: { fullName: true } },
      deliveryRecord: {
        select: {
          birthAt: true,
          attendantDoctorId: true,
          attendantDoctor: { select: { fullName: true, ownerUserId: true } },
          pregnancyEpisode: {
            select: { patientId: true, patient: { select: { fullName: true } } },
          },
        },
      },
    },
  },
} as const;

/**
 * SHK samples (P25-T10). Every state change is a conditional write — "set the
 * sample time where none is set yet" — so two people recording the same
 * heel prick at once cannot both succeed, and the loser is told rather than
 * silently overwriting the first.
 */
@Injectable()
export class ShkScreeningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWorklist(query: ShkWorklistQuery) {
    return this.prisma.shkScreening.findMany({
      where: {
        AND: [
          this.buildFilterWhere(query.filter, query.now),
          this.buildReachWhere(query.reachDoctorId),
        ],
      },
      include: SHK_SCREENING_INCLUDE,
      orderBy: [{ dueUntil: 'asc' }, { sequence: 'asc' }],
      take: SHK_WORKLIST_LIMIT,
    });
  }

  async findById(id: string) {
    return this.prisma.shkScreening.findUnique({ where: { id }, include: SHK_SCREENING_INCLUDE });
  }

  /** Whether this clinician's reach covers the sample's baby (OWN scope). */
  async isWithinReach(id: string, doctorId: string): Promise<boolean> {
    const count = await this.prisma.shkScreening.count({
      where: { id, ...this.buildReachWhere(doctorId) },
    });
    return count > 0;
  }

  /** The caller's active clinician profile, which OWN reach is measured from. */
  async findActiveDoctorIdByOwnerUserId(ownerUserId: string): Promise<string | null> {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { ownerUserId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return doctor?.id ?? null;
  }

  async recordSample(params: { id: string; takenAt: Date; takenById: string }): Promise<boolean> {
    const updated = await this.prisma.shkScreening.updateMany({
      where: { id: params.id, sampleTakenAt: null },
      data: { sampleTakenAt: params.takenAt, sampleTakenById: params.takenById },
    });
    return updated.count === 1;
  }

  async recordSent(params: { id: string; sentAt: Date; laboratoryName: string }): Promise<boolean> {
    const updated = await this.prisma.shkScreening.updateMany({
      where: { id: params.id, sentAt: null, sampleTakenAt: { not: null }, result: null },
      data: { sentAt: params.sentAt, laboratoryName: params.laboratoryName },
    });
    return updated.count === 1;
  }

  /**
   * Records the answer and, for RECALL or INVALID_SAMPLE, opens the next
   * sample in the same transaction: a recall that saved without its repeat
   * would leave the baby off every worklist.
   */
  async recordResult(payload: ShkResultPayload): Promise<{ nextScreeningId: string | null } | null> {
    return this.prisma.executeTransaction(async (tx) => {
      const updated = await tx.shkScreening.updateMany({
        where: { id: payload.id, result: null, sampleTakenAt: { not: null } },
        data: {
          resultReceivedAt: payload.receivedAt,
          result: payload.result,
          notes: payload.notes,
        },
      });
      if (updated.count !== 1) {
        return null;
      }
      if (payload.nextSample === null) {
        return { nextScreeningId: null };
      }
      const current = await tx.shkScreening.findUniqueOrThrow({
        where: { id: payload.id },
        select: { newbornCareRecordId: true },
      });
      const next = await tx.shkScreening.create({
        data: { newbornCareRecordId: current.newbornCareRecordId, ...payload.nextSample },
        select: { id: true },
      });
      return { nextScreeningId: next.id };
    });
  }

  private buildFilterWhere(
    filter: ShkWorklistFilterValue | null,
    now: Date,
  ): Prisma.ShkScreeningWhereInput {
    if (filter === 'DUE') {
      return { sampleTakenAt: null, dueFrom: { lte: now }, dueUntil: { gte: now } };
    }
    if (filter === 'OVERDUE') {
      return { sampleTakenAt: null, dueUntil: { lt: now } };
    }
    if (filter === 'AWAITING_RESULT') {
      return { sampleTakenAt: { not: null }, result: null };
    }
    if (filter === 'RECALL') {
      return { sequence: { gt: 1 }, result: null };
    }
    return { result: null };
  }

  /**
   * OWN reach, the same one a pregnancy episode is read under (P25-T06): the
   * clinician who attended the birth, or one actively assigned to the mother
   * or to the registered baby. No reach filter at all under ANY scope.
   */
  private buildReachWhere(doctorId: string | null): Prisma.ShkScreeningWhereInput {
    if (doctorId === null) {
      return {};
    }
    const activeAssignment = { some: { doctorId, unassignedAt: null } };
    return {
      newbornCareRecord: {
        OR: [
          { deliveryRecord: { attendantDoctorId: doctorId } },
          { deliveryRecord: { pregnancyEpisode: { patient: { doctors: activeAssignment } } } },
          { newbornPatient: { doctors: activeAssignment } },
        ],
      },
    };
  }
}
