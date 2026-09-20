import {
  AntenatalVisitCodeValue,
  CreatePregnancyEpisodeRecordPayload,
  ExternalDoctorVisitRow,
  PregnancyEpisodePatientRow,
  EndPregnancyEpisodeRecordPayload,
  PregnancyEpisodeRecord,
  PregnancyEpisodeVisitRow,
  RecordExternalDoctorVisitPayload,
  UpdatePregnancyEpisodeRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PregnancyEpisodeConflictError } from './pregnancy-episode-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * The only projection of `pregnancy_episodes` any query requests. Listed
 * explicitly so a column added later cannot leak through a `select`-less read.
 */
const PREGNANCY_EPISODE_SELECT = {
  id: true,
  patientId: true,
  status: true,
  lastMenstrualPeriodDate: true,
  estimatedDeliveryDate: true,
  eddSource: true,
  gravida: true,
  para: true,
  abortus: true,
  prePregnancyWeightKg: true,
  bloodType: true,
  rhesus: true,
  riskNotes: true,
  endedAt: true,
  endReason: true,
  createdAt: true,
} as const;

@Injectable()
export class MaternalCareRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Opens an episode. A second ACTIVE one for the same patient is refused by
   * the partial unique index rather than by a read-then-write here, so two
   * tabs racing get one episode and one 409 instead of two episodes.
   */
  async createEpisode(
    payload: CreatePregnancyEpisodeRecordPayload,
  ): Promise<PregnancyEpisodeRecord> {
    const episode = await this.prisma.pregnancyEpisode
      .create({
        data: {
          patientId: payload.patientId,
          lastMenstrualPeriodDate: payload.lastMenstrualPeriodDate,
          estimatedDeliveryDate: payload.estimatedDeliveryDate,
          eddSource: payload.eddSource,
          gravida: payload.gravida,
          para: payload.para,
          abortus: payload.abortus,
          prePregnancyWeightKg: payload.prePregnancyWeightKg,
          bloodType: payload.bloodType,
          rhesus: payload.rhesus,
          riskNotes: payload.riskNotes,
          createdById: payload.createdById,
        },
        select: PREGNANCY_EPISODE_SELECT,
      })
      .catch(rethrowActiveEpisodeConflict);

    return toPregnancyEpisodeRecord(episode);
  }

  async findEpisodeById(id: string): Promise<PregnancyEpisodeRecord | null> {
    const episode = await this.prisma.findFirstActive(this.prisma.pregnancyEpisode, {
      where: { id },
      select: PREGNANCY_EPISODE_SELECT,
    });

    return episode === null ? null : toPregnancyEpisodeRecord(episode);
  }

  async findActiveEpisodeByPatientId(patientId: string): Promise<PregnancyEpisodeRecord | null> {
    const episode = await this.prisma.findFirstActive(this.prisma.pregnancyEpisode, {
      where: { patientId, status: 'ACTIVE' },
      select: PREGNANCY_EPISODE_SELECT,
    });

    return episode === null ? null : toPregnancyEpisodeRecord(episode);
  }

  async listEpisodesByPatientId(patientId: string): Promise<PregnancyEpisodeRecord[]> {
    const episodes = await this.prisma.pregnancyEpisode.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: PREGNANCY_EPISODE_SELECT,
    });

    return episodes.map(toPregnancyEpisodeRecord);
  }

  async updateEpisode(
    id: string,
    payload: UpdatePregnancyEpisodeRecordPayload,
  ): Promise<PregnancyEpisodeRecord> {
    const episode = await this.prisma.pregnancyEpisode.update({
      where: { id },
      data: {
        ...(payload.lastMenstrualPeriodDate !== undefined
          ? { lastMenstrualPeriodDate: payload.lastMenstrualPeriodDate }
          : {}),
        ...(payload.estimatedDeliveryDate !== undefined
          ? { estimatedDeliveryDate: payload.estimatedDeliveryDate }
          : {}),
        ...(payload.eddSource !== undefined ? { eddSource: payload.eddSource } : {}),
        ...(payload.gravida !== undefined ? { gravida: payload.gravida } : {}),
        ...(payload.para !== undefined ? { para: payload.para } : {}),
        ...(payload.abortus !== undefined ? { abortus: payload.abortus } : {}),
        ...(payload.prePregnancyWeightKg !== undefined
          ? { prePregnancyWeightKg: payload.prePregnancyWeightKg }
          : {}),
        ...(payload.bloodType !== undefined ? { bloodType: payload.bloodType } : {}),
        ...(payload.rhesus !== undefined ? { rhesus: payload.rhesus } : {}),
        ...(payload.riskNotes !== undefined ? { riskNotes: payload.riskNotes } : {}),
      },
      select: PREGNANCY_EPISODE_SELECT,
    });

    return toPregnancyEpisodeRecord(episode);
  }

  async endEpisode(payload: EndPregnancyEpisodeRecordPayload): Promise<PregnancyEpisodeRecord> {
    const episode = await this.prisma.pregnancyEpisode.update({
      where: { id: payload.id },
      data: { status: 'ENDED', endReason: payload.reason, endedAt: payload.endedAt },
      select: PREGNANCY_EPISODE_SELECT,
    });

    return toPregnancyEpisodeRecord(episode);
  }

  /**
   * Every encounter of the episode, cancelled ones included: the numbering
   * rule needs to see a cancelled visit in order to leave it out, and the
   * caller must not have to ask twice.
   */
  async listEpisodeVisits(pregnancyEpisodeId: string): Promise<PregnancyEpisodeVisitRow[]> {
    const visits = await this.prisma.antenatalVisit.findMany({
      where: { pregnancyEpisodeId },
      orderBy: { encounter: { startedAt: 'asc' } },
      select: {
        id: true,
        encounterId: true,
        visitCode: true,
        encounter: { select: { startedAt: true, status: true, doctor: { select: { profession: true } } } },
      },
    });

    return visits.map((visit) => ({
      id: visit.id,
      encounterId: visit.encounterId,
      frozenVisitCode: visit.visitCode,
      startedAt: visit.encounter.startedAt,
      encounterStatus: visit.encounter.status,
      isAttendedByDoctor: visit.encounter.doctor.profession === 'DOCTOR',
    }));
  }

  async findVisitByEncounterId(encounterId: string): Promise<PregnancyEpisodeVisitRow | null> {
    const visit = await this.prisma.antenatalVisit.findUnique({
      where: { encounterId },
      select: {
        id: true,
        encounterId: true,
        visitCode: true,
        pregnancyEpisodeId: true,
        encounter: { select: { startedAt: true, status: true, doctor: { select: { profession: true } } } },
      },
    });
    if (visit === null) {
      return null;
    }

    return {
      id: visit.id,
      encounterId: visit.encounterId,
      pregnancyEpisodeId: visit.pregnancyEpisodeId,
      frozenVisitCode: visit.visitCode,
      startedAt: visit.encounter.startedAt,
      encounterStatus: visit.encounter.status,
      isAttendedByDoctor: visit.encounter.doctor.profession === 'DOCTOR',
    };
  }

  /** Counts this encounter as a visit of the episode. Unique on the encounter. */
  async linkVisit(payload: { pregnancyEpisodeId: string; encounterId: string }): Promise<string> {
    const visit = await this.prisma.antenatalVisit.create({
      data: payload,
      select: { id: true },
    });

    return visit.id;
  }

  /**
   * Freezes the code onto a visit as its encounter closes (P25-T06). Called
   * from the encounter close path, which is why it takes the code already
   * resolved rather than resolving it here — a repository does not decide what
   * a visit is called.
   */
  async freezeVisitCode(payload: {
    encounterId: string;
    visitCode: AntenatalVisitCodeValue;
  }): Promise<void> {
    await this.prisma.antenatalVisit.updateMany({
      where: { encounterId: payload.encounterId, visitCode: null },
      data: { visitCode: payload.visitCode },
    });
  }

  async listExternalDoctorVisits(pregnancyEpisodeId: string): Promise<ExternalDoctorVisitRow[]> {
    return this.prisma.pregnancyExternalDoctorVisit.findMany({
      where: { pregnancyEpisodeId, deletedAt: null },
      orderBy: { visitedAt: 'asc' },
      select: { id: true, facilityName: true, visitedAt: true, isUltrasoundDone: true },
    });
  }

  async recordExternalDoctorVisit(
    payload: RecordExternalDoctorVisitPayload,
  ): Promise<ExternalDoctorVisitRow> {
    return this.prisma.pregnancyExternalDoctorVisit.create({
      data: payload,
      select: { id: true, facilityName: true, visitedAt: true, isUltrasoundDone: true },
    });
  }

  /**
   * The patient's sex, for the create guard, and who owns her record, for the
   * own-scope read: a patient reading her own pregnancy is unaffected by the
   * clinician rules (D-033).
   */
  async findPatientForEpisode(patientId: string): Promise<PregnancyEpisodePatientRow | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: { id: patientId },
      select: { sex: true, ownerUserId: true },
    });
  }
}

/**
 * The partial unique index is the only thing standing between two tabs and two
 * ACTIVE episodes, so its violation is translated here into the error the
 * service turns into a 409 — never swallowed into a generic 500.
 */
function rethrowActiveEpisodeConflict(caughtError: unknown): never {
  const errorCode = (caughtError as { code?: unknown } | null)?.code;
  if (errorCode === UNIQUE_CONSTRAINT_ERROR_CODE) {
    throw new PregnancyEpisodeConflictError();
  }
  throw caughtError;
}

function toPregnancyEpisodeRecord(row: {
  id: string;
  patientId: string;
  status: string;
  lastMenstrualPeriodDate: Date | null;
  estimatedDeliveryDate: Date;
  eddSource: string;
  gravida: number;
  para: number;
  abortus: number;
  prePregnancyWeightKg: unknown;
  bloodType: string | null;
  rhesus: string | null;
  riskNotes: string | null;
  endedAt: Date | null;
  endReason: string | null;
  createdAt: Date;
}): PregnancyEpisodeRecord {
  return {
    ...row,
    status: row.status as PregnancyEpisodeRecord['status'],
    eddSource: row.eddSource as PregnancyEpisodeRecord['eddSource'],
    endReason: row.endReason as PregnancyEpisodeRecord['endReason'],
    prePregnancyWeightKg:
      row.prePregnancyWeightKg === null ? null : Number(row.prePregnancyWeightKg),
  };
}
