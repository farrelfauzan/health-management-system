import {
  AntenatalDueEpisodeRecord,
  AntenatalExaminationRow,
  AntenatalVisitCodeValue,
  MaternalLetterPatient,
  CreatePregnancyEpisodeRecordPayload,
  ExternalDoctorVisitRow,
  PregnancyEpisodePatientRow,
  EndPregnancyEpisodeRecordPayload,
  PregnancyEpisodeRecord,
  PregnancyEpisodeVisitRow,
  RecordExternalDoctorVisitPayload,
  TenTChecklistSources,
  UpdatePregnancyEpisodeRecordPayload,
  UpsertAntenatalExaminationPayload,
  MaternalDueReach,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { buildPatientReachFilter } from './build-patient-reach-filter';
import { enqueueSatusehatEpisodeClose } from './enqueue-satusehat-episode-close';
import { PregnancyEpisodeConflictError } from './pregnancy-episode-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/** The only projection of `antenatal_examinations` any query requests. */
const ANTENATAL_EXAMINATION_SELECT = {
  id: true,
  antenatalVisitId: true,
  muacCm: true,
  fundalHeightCm: true,
  fetalHeartRateBpm: true,
  fetalPresentation: true,
  fetalHeadEngagement: true,
  fetalCount: true,
  estimatedFetalWeightGrams: true,
  tetanusStatus: true,
  ironTabletsGiven: true,
  counsellingTopics: true,
  caseManagementNotes: true,
} as const;

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

/** One antenatal visit as the numbering rule reads it. */
const ANTENATAL_VISIT_ROW_SELECT = {
  id: true,
  encounterId: true,
  visitCode: true,
  encounter: { select: { startedAt: true, status: true, doctor: { select: { profession: true } } } },
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

  /**
   * Ends the pregnancy and, in the same transaction, enqueues the close of its
   * SATUSEHAT episode (P25-T08).
   *
   * One transaction rather than two writes: the close is a transactional
   * outbox row attached to the event that ends the pregnancy, so a crash
   * between them cannot leave an episode active on the national record with
   * nothing left to notice.
   *
   * Only when the pregnancy actually has an episode id. A pregnancy whose
   * visits never reached SATUSEHAT — an unconfigured deployment, or a woman
   * who booked and miscarried before her first visit closed — has nothing to
   * close, and a row for it would fail for ever.
   */
  async endEpisode(payload: EndPregnancyEpisodeRecordPayload): Promise<PregnancyEpisodeRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const episode = await tx.pregnancyEpisode.update({
        where: { id: payload.id },
        data: { status: 'ENDED', endReason: payload.reason, endedAt: payload.endedAt },
        select: PREGNANCY_EPISODE_SELECT,
      });
      await enqueueSatusehatEpisodeClose(tx, payload.id);

      return toPregnancyEpisodeRecord(episode);
    });
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
      select: ANTENATAL_VISIT_ROW_SELECT,
    });

    return visits.map(toPregnancyEpisodeVisitRow);
  }

  /**
   * Every active pregnancy within the reach, with her name and every visit
   * (P25-T17). One query rather than an episode read per row: the worklist
   * evaluates them all.
   */
  async listActiveEpisodesForDue(reach: MaternalDueReach): Promise<AntenatalDueEpisodeRecord[]> {
    const episodes = await this.prisma.pregnancyEpisode.findMany({
      where: { status: 'ACTIVE', deletedAt: null, patient: buildPatientReachFilter(reach) },
      orderBy: { createdAt: 'asc' },
      select: {
        ...PREGNANCY_EPISODE_SELECT,
        patient: { select: { fullName: true, mrn: true } },
        antenatalVisits: {
          orderBy: { encounter: { startedAt: 'asc' } },
          select: ANTENATAL_VISIT_ROW_SELECT,
        },
      },
    });
    return episodes.map(({ patient, antenatalVisits, ...episode }) => ({
      episode: toPregnancyEpisodeRecord(episode),
      patientName: patient.fullName,
      medicalRecordNumber: patient.mrn,
      visits: antenatalVisits.map(toPregnancyEpisodeVisitRow),
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
   * One visit's 10T examination, or null when nothing has been recorded yet.
   */
  async findExaminationByVisitId(
    antenatalVisitId: string,
  ): Promise<AntenatalExaminationRow | null> {
    const examination = await this.prisma.antenatalExamination.findUnique({
      where: { antenatalVisitId },
      select: ANTENATAL_EXAMINATION_SELECT,
    });

    return examination === null ? null : toAntenatalExaminationRow(examination);
  }

  /**
   * Upserts the examination. One row per visit, so a midwife who comes back to
   * add the foetal heart rate edits the row she started rather than filing a
   * second reading of the same examination.
   */
  async upsertExamination(payload: UpsertAntenatalExaminationPayload): Promise<AntenatalExaminationRow> {
    const { antenatalVisitId, recordedById, ...fields } = payload;
    const examination = await this.prisma.antenatalExamination.upsert({
      where: { antenatalVisitId },
      create: { antenatalVisitId, recordedById, ...fields },
      update: fields,
      select: ANTENATAL_EXAMINATION_SELECT,
    });

    return toAntenatalExaminationRow(examination);
  }

  /**
   * What the 10T checklist reads off the rest of the encounter. One query per
   * source, counted rather than fetched: the checklist asks whether the thing
   * exists, never what it said.
   */
  async findChecklistSources(encounterId: string): Promise<TenTChecklistSources> {
    const [vitals, immunizationCount, labOrderCount, prescriptionCount] = await Promise.all([
      this.prisma.vitalSigns.findFirst({
        where: { encounterId, deletedAt: null },
        orderBy: { recordedAt: 'desc' },
        select: {
          weightKg: true,
          heightCm: true,
          systolicBloodPressure: true,
          diastolicBloodPressure: true,
        },
      }),
      this.prisma.immunization.count({ where: { encounterId, deletedAt: null } }),
      // A lab order has no soft delete — it is cancelled instead — and a
      // cancelled order is not a test that was done.
      this.prisma.labOrder.count({ where: { encounterId, status: { not: 'CANCELLED' } } }),
      this.prisma.prescription.count({ where: { encounterId, deletedAt: null } }),
    ]);

    return {
      hasWeightAndHeight: vitals !== null && vitals.weightKg !== null && vitals.heightCm !== null,
      hasBloodPressure:
        vitals !== null &&
        vitals.systolicBloodPressure !== null &&
        vitals.diastolicBloodPressure !== null,
      hasImmunization: immunizationCount > 0,
      hasLabOrder: labOrderCount > 0,
      hasIronPrescription: prescriptionCount > 0,
    };
  }

  /** The latest vitals a referral rule may look at, as plain numbers. */
  async findLatestVitalsForRules(encounterId: string): Promise<{
    systolicBloodPressure: number | null;
    diastolicBloodPressure: number | null;
  }> {
    const vitals = await this.prisma.vitalSigns.findFirst({
      where: { encounterId, deletedAt: null },
      orderBy: { recordedAt: 'desc' },
      select: { systolicBloodPressure: true, diastolicBloodPressure: true },
    });

    return {
      systolicBloodPressure: vitals?.systolicBloodPressure ?? null,
      diastolicBloodPressure: vitals?.diastolicBloodPressure ?? null,
    };
  }

  async listReferralDismissals(antenatalVisitId: string): Promise<Record<string, string>> {
    const dismissals = await this.prisma.antenatalReferralDismissal.findMany({
      where: { antenatalVisitId },
      select: { ruleCode: true, reason: true },
    });

    return Object.fromEntries(dismissals.map((row) => [row.ruleCode, row.reason]));
  }

  async recordReferralDismissal(payload: {
    antenatalVisitId: string;
    ruleCode: string;
    reason: string;
    dismissedById: string;
  }): Promise<void> {
    await this.prisma.antenatalReferralDismissal.upsert({
      where: {
        antenatalVisitId_ruleCode: {
          antenatalVisitId: payload.antenatalVisitId,
          ruleCode: payload.ruleCode,
        },
      },
      create: payload,
      update: { reason: payload.reason, dismissedById: payload.dismissedById },
    });
  }

  /**
   * What a maternal letter prints about the patient (P25-T07). `nikLast4` is
   * the stored partial, never a decrypt: the full identifier has no business
   * on a letter carried by hand to another facility.
   */
  async findLetterPatient(patientId: string): Promise<MaternalLetterPatient | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: { id: patientId },
      select: {
        fullName: true,
        mrn: true,
        dateOfBirth: true,
        sex: true,
        address: true,
        nikLast4: true,
      },
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

/** Decimals come back as Prisma Decimals; the contract carries numbers. */
function toAntenatalExaminationRow(row: {
  id: string;
  antenatalVisitId: string;
  muacCm: unknown;
  fundalHeightCm: unknown;
  fetalHeartRateBpm: number | null;
  fetalPresentation: string | null;
  fetalHeadEngagement: string | null;
  fetalCount: number | null;
  estimatedFetalWeightGrams: number | null;
  tetanusStatus: string | null;
  ironTabletsGiven: number | null;
  counsellingTopics: string[];
  caseManagementNotes: string | null;
}): AntenatalExaminationRow {
  return {
    ...row,
    muacCm: row.muacCm === null ? null : Number(row.muacCm),
    fundalHeightCm: row.fundalHeightCm === null ? null : Number(row.fundalHeightCm),
    fetalPresentation: row.fetalPresentation as AntenatalExaminationRow['fetalPresentation'],
    fetalHeadEngagement:
      row.fetalHeadEngagement as AntenatalExaminationRow['fetalHeadEngagement'],
    tetanusStatus: row.tetanusStatus as AntenatalExaminationRow['tetanusStatus'],
  };
}

function toPregnancyEpisodeVisitRow(visit: {
  id: string;
  encounterId: string;
  visitCode: AntenatalVisitCodeValue | null;
  encounter: { startedAt: Date; status: string; doctor: { profession: string } };
}): PregnancyEpisodeVisitRow {
  return {
    id: visit.id,
    encounterId: visit.encounterId,
    frozenVisitCode: visit.visitCode,
    startedAt: visit.encounter.startedAt,
    encounterStatus: visit.encounter.status,
    isAttendedByDoctor: visit.encounter.doctor.profession === 'DOCTOR',
  };
}
