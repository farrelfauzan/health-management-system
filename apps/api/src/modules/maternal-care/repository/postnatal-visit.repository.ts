import {
  LinkPostnatalVisitPayload,
  PostnatalBirthRecord,
  PostnatalEpisodeCloseCandidate,
  PostnatalExaminationRecord,
  PostnatalNewbornRecord,
  PostnatalVisitCodeValue,
  PostnatalVisitRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';
const MILLISECONDS_PER_DAY = 86_400_000;
/** No nifas window reaches past the end of day 42, which is at least this late. */
const LAST_WINDOW_MINIMUM_DAYS = 42;

const POSTNATAL_VISIT_SELECT = {
  id: true,
  encounterId: true,
  subject: true,
  pregnancyEpisodeId: true,
  newbornCareRecordId: true,
  visitCode: true,
  encounter: { select: { startedAt: true, status: true } },
} as const;

const POSTNATAL_EXAMINATION_SELECT = {
  vaginalBleeding: true,
  bloodLossMl: true,
  perineumCondition: true,
  perinealInfectionSigns: true,
  caesareanWoundInfectionSigns: true,
  breastCondition: true,
  uterineContraction: true,
  lochiaColour: true,
  lochiaOdour: true,
  breastMilkProduction: true,
  urination: true,
  defecation: true,
  newbornCareCounselling: true,
  vitaminAGivenAt: true,
  vitaminAMedicationId: true,
  familyPlanningCounselling: true,
} as const;

type PostnatalVisitRow = {
  id: string;
  encounterId: string;
  subject: PostnatalVisitRecord['subject'];
  pregnancyEpisodeId: string;
  newbornCareRecordId: string | null;
  visitCode: PostnatalVisitCodeValue | null;
  encounter: { startedAt: Date; status: string };
};

function toPostnatalVisitRecord(row: PostnatalVisitRow): PostnatalVisitRecord {
  return {
    id: row.id,
    encounterId: row.encounterId,
    subject: row.subject,
    pregnancyEpisodeId: row.pregnancyEpisodeId,
    newbornCareRecordId: row.newbornCareRecordId,
    visitCode: row.visitCode,
    encounterStartedAt: row.encounter.startedAt,
    encounterStatus: row.encounter.status,
  };
}

/**
 * Nifas and neonatal visits, their examination, and the sweep that closes the
 * PNC episode (P25-T12). The only file in this feature that touches Prisma.
 */
@Injectable()
export class PostnatalVisitRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The mother's most recent birth at or before `asOf` — the one a nifas visit
   * on that day belongs to. A birth recorded later cannot own an earlier visit.
   */
  async findLatestBirthForMother(patientId: string, asOf: Date): Promise<PostnatalBirthRecord | null> {
    const delivery = await this.prisma.deliveryRecord.findFirst({
      where: {
        birthAt: { lte: asOf },
        pregnancyEpisode: { patientId, deletedAt: null },
      },
      orderBy: { birthAt: 'desc' },
      select: { birthAt: true, pregnancyEpisode: { select: { id: true, patientId: true } } },
    });
    if (delivery === null) {
      return null;
    }
    return {
      pregnancyEpisodeId: delivery.pregnancyEpisode.id,
      patientId: delivery.pregnancyEpisode.patientId,
      birthAt: delivery.birthAt,
    };
  }

  async findBirthByPregnancyEpisodeId(pregnancyEpisodeId: string): Promise<PostnatalBirthRecord | null> {
    const delivery = await this.prisma.deliveryRecord.findFirst({
      where: { pregnancyEpisodeId, pregnancyEpisode: { deletedAt: null } },
      select: { birthAt: true, pregnancyEpisode: { select: { id: true, patientId: true } } },
    });
    if (delivery === null) {
      return null;
    }
    return {
      pregnancyEpisodeId: delivery.pregnancyEpisode.id,
      patientId: delivery.pregnancyEpisode.patientId,
      birthAt: delivery.birthAt,
    };
  }

  /**
   * The baby a neonatal visit is for: by id when the caller named one,
   * otherwise the one record whose registered patient is this encounter's.
   */
  async findNewborn(params: {
    newbornCareRecordId: string | null;
    newbornPatientId: string;
  }): Promise<PostnatalNewbornRecord | null> {
    const newborn = await this.prisma.newbornCareRecord.findFirst({
      where:
        params.newbornCareRecordId === null
          ? { newbornPatientId: params.newbornPatientId }
          : { id: params.newbornCareRecordId },
      select: {
        id: true,
        newbornPatientId: true,
        deliveryRecord: { select: { pregnancyEpisodeId: true, birthAt: true } },
      },
    });
    if (newborn === null) {
      return null;
    }
    return {
      newbornCareRecordId: newborn.id,
      newbornPatientId: newborn.newbornPatientId,
      pregnancyEpisodeId: newborn.deliveryRecord.pregnancyEpisodeId,
      birthAt: newborn.deliveryRecord.birthAt,
    };
  }

  async hasAntenatalVisit(encounterId: string): Promise<boolean> {
    const visit = await this.prisma.antenatalVisit.findUnique({
      where: { encounterId },
      select: { id: true },
    });
    return visit !== null;
  }

  async hasMedication(medicationId: string): Promise<boolean> {
    const medication = await this.prisma.medication.findFirst({
      where: { id: medicationId, deletedAt: null },
      select: { id: true },
    });
    return medication !== null;
  }

  async findVisitByEncounterId(encounterId: string): Promise<PostnatalVisitRecord | null> {
    const row = await this.prisma.postnatalVisit.findUnique({
      where: { encounterId },
      select: POSTNATAL_VISIT_SELECT,
    });
    return row === null ? null : toPostnatalVisitRecord(row);
  }

  async listVisitsByPregnancyEpisodeId(pregnancyEpisodeId: string): Promise<PostnatalVisitRecord[]> {
    const rows = await this.prisma.postnatalVisit.findMany({
      where: { pregnancyEpisodeId },
      orderBy: { encounter: { startedAt: 'asc' } },
      select: POSTNATAL_VISIT_SELECT,
    });
    return rows.map(toPostnatalVisitRecord);
  }

  /**
   * Links the visit. Returns null when the unique encounter index says a
   * second tab got there first, which the service turns into a 409.
   */
  async createVisit(payload: LinkPostnatalVisitPayload): Promise<PostnatalVisitRecord | null> {
    try {
      const row = await this.prisma.postnatalVisit.create({
        data: payload,
        select: POSTNATAL_VISIT_SELECT,
      });
      return toPostnatalVisitRecord(row);
    } catch (caughtError) {
      if ((caughtError as { code?: unknown } | null)?.code === UNIQUE_CONSTRAINT_ERROR_CODE) {
        return null;
      }
      throw caughtError;
    }
  }

  async saveVisitCode(params: {
    encounterId: string;
    visitCode: PostnatalVisitCodeValue | null;
  }): Promise<void> {
    await this.prisma.postnatalVisit.update({
      where: { encounterId: params.encounterId },
      data: { visitCode: params.visitCode },
    });
  }

  async findExamination(postnatalVisitId: string): Promise<PostnatalExaminationRecord | null> {
    return this.prisma.postnatalExamination.findUnique({
      where: { postnatalVisitId },
      select: POSTNATAL_EXAMINATION_SELECT,
    });
  }

  /** One examination per visit: coming back to add a finding edits the row. */
  async upsertExamination(params: {
    postnatalVisitId: string;
    values: Partial<PostnatalExaminationRecord>;
    recordedById: string;
  }): Promise<PostnatalExaminationRecord> {
    return this.prisma.postnatalExamination.upsert({
      where: { postnatalVisitId: params.postnatalVisitId },
      create: {
        postnatalVisitId: params.postnatalVisitId,
        recordedById: params.recordedById,
        ...params.values,
      },
      update: params.values,
      select: POSTNATAL_EXAMINATION_SELECT,
    });
  }

  /**
   * Births whose PNC episode may be due to close as of `asOf`: the episode is
   * on the platform, the birth is at least 42 days old, and no close was ever
   * enqueued — not merely none open, so a close that was sent is not followed
   * by another on the next sweep. The service checks the exact end of KF4.
   */
  async findEpisodeCloseCandidates(asOf: Date): Promise<PostnatalEpisodeCloseCandidate[]> {
    const latestBirthAt = new Date(asOf.getTime() - LAST_WINDOW_MINIMUM_DAYS * MILLISECONDS_PER_DAY);
    const deliveries = await this.prisma.deliveryRecord.findMany({
      where: {
        birthAt: { lte: latestBirthAt },
        pregnancyEpisode: {
          deletedAt: null,
          satusehatPostnatalEpisodeOfCareId: { not: null },
          satusehatSubmissions: { none: { kind: 'POSTNATAL_EPISODE_FINISH' } },
        },
      },
      select: { pregnancyEpisodeId: true, birthAt: true },
    });
    return deliveries.map((delivery) => ({
      pregnancyEpisodeId: delivery.pregnancyEpisodeId,
      birthAt: delivery.birthAt,
    }));
  }

  /**
   * Enqueues the PNC close. False when a racing sweep's row is already open —
   * the partial unique index refuses the second one.
   */
  async enqueueEpisodeClose(pregnancyEpisodeId: string): Promise<boolean> {
    try {
      await this.prisma.satusehatSubmission.create({
        data: { pregnancyEpisodeId, kind: 'POSTNATAL_EPISODE_FINISH' },
      });
      return true;
    } catch (caughtError) {
      if ((caughtError as { code?: unknown } | null)?.code === UNIQUE_CONSTRAINT_ERROR_CODE) {
        return false;
      }
      throw caughtError;
    }
  }
}
