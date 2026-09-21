import {
  CreateFamilyPlanningCoursePayload,
  CreateFamilyPlanningServicePayload,
  DiscontinueFamilyPlanningCoursePayload,
  FamilyPlanningCourseRecord,
  FamilyPlanningDeliveryCandidateRecord,
  FamilyPlanningDueRecord,
  FamilyPlanningDueScope,
  FamilyPlanningLinkRecord,
  FamilyPlanningPatientRecord,
  FamilyPlanningProviderRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { FamilyPlanningCourseConflictError } from './family-planning-course-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/** Everything a course is read back with, in one shape. */
const COURSE_SELECT = {
  id: true,
  patientId: true,
  method: true,
  acceptorType: true,
  startedOn: true,
  providerDoctorId: true,
  providerDoctor: { select: { fullName: true } },
  startEncounterId: true,
  deliveryRecordId: true,
  mandateId: true,
  nextDueOn: true,
  sideEffects: true,
  discontinuedOn: true,
  discontinuationReason: true,
  services: {
    orderBy: [{ servedOn: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, encounterId: true, servedOn: true, action: true, nextDueOn: true },
  },
} as const satisfies Prisma.FamilyPlanningRecordSelect;

/**
 * The family planning course and its follow-ups (P25-T14). The only file that
 * touches `family_planning_records` and `family_planning_services`.
 */
@Injectable()
export class FamilyPlanningRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPatient(patientId: string): Promise<FamilyPlanningPatientRecord | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: { id: patientId },
      select: { id: true, ownerUserId: true },
    });
  }

  async findProvider(doctorId: string): Promise<FamilyPlanningProviderRecord | null> {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { id: doctorId },
      select: { id: true, profession: true },
    });
  }

  /** The caller's own active clinician profile id, for the own-scope due list. */
  async findActiveDoctorIdByOwnerUserId(ownerUserId: string): Promise<string | null> {
    const doctor = await this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { ownerUserId, isActive: true },
      select: { id: true },
    });
    return doctor?.id ?? null;
  }

  async findEncounterLink(encounterId: string): Promise<FamilyPlanningLinkRecord | null> {
    return this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id: encounterId },
      select: { id: true, patientId: true },
    });
  }

  async findDeliveryLink(deliveryRecordId: string): Promise<FamilyPlanningLinkRecord | null> {
    const delivery = await this.prisma.deliveryRecord.findUnique({
      where: { id: deliveryRecordId },
      select: { id: true, pregnancyEpisode: { select: { patientId: true } } },
    });
    return delivery === null
      ? null
      : { id: delivery.id, patientId: delivery.pregnancyEpisode.patientId };
  }

  async listCoursesByPatientId(patientId: string): Promise<FamilyPlanningCourseRecord[]> {
    return this.prisma.familyPlanningRecord.findMany({
      where: { patientId },
      orderBy: [{ startedOn: 'desc' }, { createdAt: 'desc' }],
      select: COURSE_SELECT,
    });
  }

  async findCourseById(id: string): Promise<FamilyPlanningCourseRecord | null> {
    return this.prisma.familyPlanningRecord.findUnique({ where: { id }, select: COURSE_SELECT });
  }

  async createCourse(
    payload: CreateFamilyPlanningCoursePayload,
  ): Promise<FamilyPlanningCourseRecord> {
    try {
      return await this.prisma.familyPlanningRecord.create({
        data: payload,
        select: COURSE_SELECT,
      });
    } catch (caughtError: unknown) {
      return rethrowLiveCourseConflict(caughtError);
    }
  }

  /**
   * The service and the due date it moves the course to, in one transaction:
   * the due list reads the course, so the two must never disagree.
   */
  async createService(
    payload: CreateFamilyPlanningServicePayload,
  ): Promise<FamilyPlanningCourseRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.familyPlanningService.create({
        data: {
          familyPlanningRecordId: payload.familyPlanningRecordId,
          encounterId: payload.encounterId,
          servedOn: payload.servedOn,
          action: payload.action,
          nextDueOn: payload.nextDueOn,
        },
      });
      return tx.familyPlanningRecord.update({
        where: { id: payload.familyPlanningRecordId },
        data: {
          nextDueOn: payload.nextDueOn,
          ...(payload.sideEffects === null ? {} : { sideEffects: payload.sideEffects }),
        },
        select: COURSE_SELECT,
      });
    });
  }

  async discontinueCourse(
    payload: DiscontinueFamilyPlanningCoursePayload,
  ): Promise<FamilyPlanningCourseRecord> {
    return this.prisma.familyPlanningRecord.update({
      where: { id: payload.id },
      data: { discontinuedOn: payload.discontinuedOn, discontinuationReason: payload.reason },
      select: COURSE_SELECT,
    });
  }

  /** Live courses due on or before `dueOnOrBefore`, overdue ones included. */
  async listDue(params: {
    dueOnOrBefore: Date;
    scope: FamilyPlanningDueScope;
  }): Promise<FamilyPlanningDueRecord[]> {
    const rows = await this.prisma.familyPlanningRecord.findMany({
      where: {
        discontinuedOn: null,
        nextDueOn: { not: null, lte: params.dueOnOrBefore },
        patient: { deletedAt: null },
        ...buildDueScopeFilter(params.scope),
      },
      orderBy: [{ nextDueOn: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        patientId: true,
        method: true,
        nextDueOn: true,
        patient: { select: { fullName: true, mrn: true } },
      },
    });
    return rows.map((row) => ({ ...row, nextDueOn: row.nextDueOn as Date }));
  }

  /**
   * Her most recent birth since `bornOnOrAfter` that no course links to yet —
   * what the KB tab offers as KB pasca salin.
   */
  async findPostDeliveryCandidate(params: {
    patientId: string;
    bornOnOrAfter: Date;
  }): Promise<FamilyPlanningDeliveryCandidateRecord | null> {
    return this.prisma.deliveryRecord.findFirst({
      where: {
        pregnancyEpisode: { patientId: params.patientId, deletedAt: null },
        birthAt: { gte: params.bornOnOrAfter },
        familyPlanningRecords: { none: {} },
      },
      orderBy: { birthAt: 'desc' },
      select: { id: true, birthAt: true },
    });
  }
}

function buildDueScopeFilter(scope: FamilyPlanningDueScope): Prisma.FamilyPlanningRecordWhereInput {
  if (scope.hasAny) {
    return {};
  }
  const reach: Prisma.FamilyPlanningRecordWhereInput[] = [
    { patient: { ownerUserId: scope.ownerUserId } },
  ];
  if (scope.doctorId !== null) {
    reach.push(
      { providerDoctorId: scope.doctorId },
      { patient: { doctors: { some: { doctorId: scope.doctorId, unassignedAt: null } } } },
    );
  }
  return { OR: reach };
}

/**
 * The partial unique index is the only thing standing between two tabs and two
 * live courses, so its violation becomes the error the service answers 409 to.
 */
function rethrowLiveCourseConflict(caughtError: unknown): never {
  const errorCode = (caughtError as { code?: unknown } | null)?.code;
  if (errorCode === UNIQUE_CONSTRAINT_ERROR_CODE) {
    throw new FamilyPlanningCourseConflictError();
  }
  throw caughtError;
}
