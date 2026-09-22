import {
  DocumentCategoryValue,
  MaternalReportMonthRange,
  NON_CAPITATION_OBSTETRIC_ULTRASOUND_PROCEDURE_CODE,
  NonCapitationAntenatalSource,
  NonCapitationDeliverySource,
  NonCapitationDocumentSource,
  NonCapitationFamilyPlanningSource,
  NonCapitationMarkSource,
  NonCapitationPostnatalSource,
  NonCapitationServiceTypeValue,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

/**
 * A BPJS participant is a patient with a BPJS number (P25-T16, D-043). Not
 * the PCare outbox and not a PCare config: a jejaring PMB has neither.
 */
const BPJS_PATIENT_WHERE = {
  deletedAt: null,
  bpjsNumberCiphertext: { not: null },
} satisfies Prisma.PatientProfileWhereInput;

const PATIENT_SELECT = {
  id: true,
  fullName: true,
  bpjsNumberLast4: true,
} satisfies Prisma.PatientProfileSelect;

const PROFESSION_SELECT = { select: { profession: true } } as const;

/**
 * What the recap needs of a visit's encounter: when, who examined, whether
 * an obstetric ultrasound was recorded and whether a referral left from it.
 * Only presence is read — never a finding, a diagnosis or a letter's text.
 */
const VISIT_ENCOUNTER_SELECT = {
  id: true,
  startedAt: true,
  patient: { select: PATIENT_SELECT },
  doctor: PROFESSION_SELECT,
  procedures: {
    where: {
      deletedAt: null,
      code: { startsWith: NON_CAPITATION_OBSTETRIC_ULTRASOUND_PROCEDURE_CODE },
    },
    select: { id: true },
  },
  bpjsReferral: { select: { deletedAt: true } },
  clinicalDocuments: {
    where: { deletedAt: null, category: 'REFERRAL_LETTER' },
    select: { id: true },
  },
} satisfies Prisma.EncounterSelect;

function buildFinishedEncounterWhere(range: MaternalReportMonthRange): Prisma.EncounterWhereInput {
  return {
    deletedAt: null,
    status: 'FINISHED',
    startedAt: { gte: range.startInclusive, lt: range.endExclusive },
    patient: BPJS_PATIENT_WHERE,
  };
}

const MOTHER_VISIT_CODES = ['KF1', 'KF2', 'KF3', 'KF4'] as const;

function isMotherVisitCode(
  visitCode: string | null,
): visitCode is (typeof MOTHER_VISIT_CODES)[number] {
  return MOTHER_VISIT_CODES.some((code) => code === visitCode);
}

/** A surat rujukan filed on the encounter, or a live PCare referral from it. */
function hasReferral(encounter: {
  readonly clinicalDocuments: readonly { id: string }[];
  readonly bpjsReferral: { deletedAt: Date | null } | null;
}): boolean {
  return (
    encounter.clinicalDocuments.length > 0 ||
    (encounter.bpjsReferral !== null && encounter.bpjsReferral.deletedAt === null)
  );
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Read-only access to the records a month's non-capitation recap is derived
 * from (P25-T16): FINISHED antenatal and nifas encounters, recorded births
 * and KB acts of BPJS participants, the categories of their filed documents,
 * and the marks already made. Keyed off encounters and admissions, never the
 * PCare outbox.
 */
@Injectable()
export class BpjsNonCapitationRecapRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAntenatalVisits(
    range: MaternalReportMonthRange,
  ): Promise<NonCapitationAntenatalSource[]> {
    const rows = await this.prisma.antenatalVisit.findMany({
      where: {
        pregnancyEpisode: { deletedAt: null },
        encounter: buildFinishedEncounterWhere(range),
      },
      select: { id: true, visitCode: true, encounter: { select: VISIT_ENCOUNTER_SELECT } },
    });
    return rows.map((row) => ({
      antenatalVisitId: row.id,
      encounterId: row.encounter.id,
      startedAt: row.encounter.startedAt,
      visitCode: row.visitCode,
      examinerProfession: row.encounter.doctor.profession,
      hasUltrasound: row.encounter.procedures.length > 0,
      hasReferral: hasReferral(row.encounter),
      patient: row.encounter.patient,
    }));
  }

  /** The mother's KF visits only: the newborn's KN is paid inside KF1–KF3. */
  async listPostnatalVisits(
    range: MaternalReportMonthRange,
  ): Promise<NonCapitationPostnatalSource[]> {
    const rows = await this.prisma.postnatalVisit.findMany({
      where: {
        subject: 'MOTHER',
        visitCode: { in: [...MOTHER_VISIT_CODES] },
        pregnancyEpisode: { deletedAt: null },
        encounter: buildFinishedEncounterWhere(range),
      },
      select: { id: true, visitCode: true, encounter: { select: VISIT_ENCOUNTER_SELECT } },
    });
    return rows.flatMap((row) =>
      isMotherVisitCode(row.visitCode)
        ? [
            {
              postnatalVisitId: row.id,
              encounterId: row.encounter.id,
              startedAt: row.encounter.startedAt,
              visitCode: row.visitCode,
              examinerProfession: row.encounter.doctor.profession,
              hasReferral: hasReferral(row.encounter),
              patient: row.encounter.patient,
            },
          ]
        : [],
    );
  }

  async listDeliveries(range: MaternalReportMonthRange): Promise<NonCapitationDeliverySource[]> {
    const rows = await this.prisma.deliveryRecord.findMany({
      where: {
        birthAt: { gte: range.startInclusive, lt: range.endExclusive },
        pregnancyEpisode: { deletedAt: null, patient: BPJS_PATIENT_WHERE },
      },
      select: {
        id: true,
        birthAt: true,
        admissionId: true,
        attendantDoctor: PROFESSION_SELECT,
        newbornCareRecords: { select: { newbornPatientId: true } },
        pregnancyEpisode: { select: { patient: { select: PATIENT_SELECT } } },
      },
    });
    return rows.map((row) => ({
      deliveryRecordId: row.id,
      birthAt: row.birthAt,
      admissionId: row.admissionId,
      attendantProfession: row.attendantDoctor.profession,
      newbornPatientIds: row.newbornCareRecords.flatMap((newborn) =>
        newborn.newbornPatientId === null ? [] : [newborn.newbornPatientId],
      ),
      patient: row.pregnancyEpisode.patient,
    }));
  }

  /** Course starts and follow-up services dated inside the month. */
  async listFamilyPlanningActs(
    range: MaternalReportMonthRange,
  ): Promise<NonCapitationFamilyPlanningSource[]> {
    const servedWithin = { gte: toDateOnly(range.firstDay), lte: toDateOnly(range.lastDay) };
    const [starts, services] = await Promise.all([
      this.prisma.familyPlanningRecord.findMany({
        where: { startedOn: servedWithin, patient: BPJS_PATIENT_WHERE },
        select: {
          id: true,
          method: true,
          acceptorType: true,
          startedOn: true,
          startEncounterId: true,
          providerDoctor: PROFESSION_SELECT,
          patient: { select: PATIENT_SELECT },
        },
      }),
      this.prisma.familyPlanningService.findMany({
        where: { servedOn: servedWithin, familyPlanningRecord: { patient: BPJS_PATIENT_WHERE } },
        select: {
          id: true,
          servedOn: true,
          encounterId: true,
          nextDueOn: true,
          encounter: { select: { doctor: PROFESSION_SELECT } },
          familyPlanningRecord: {
            select: {
              method: true,
              acceptorType: true,
              providerDoctor: PROFESSION_SELECT,
              patient: { select: PATIENT_SELECT },
            },
          },
        },
      }),
    ]);
    return [
      ...starts.map((row) => ({
        sourceId: row.id,
        kind: 'COURSE_START' as const,
        method: row.method,
        acceptorType: row.acceptorType,
        servedOn: row.startedOn,
        encounterId: row.startEncounterId,
        setsNextDueDate: false,
        examinerProfession: row.providerDoctor.profession,
        patient: row.patient,
      })),
      ...services.map((row) => ({
        sourceId: row.id,
        kind: 'SERVICE' as const,
        method: row.familyPlanningRecord.method,
        acceptorType: row.familyPlanningRecord.acceptorType,
        servedOn: row.servedOn,
        encounterId: row.encounterId,
        setsNextDueDate: row.nextDueOn !== null,
        examinerProfession:
          row.encounter?.doctor.profession ?? row.familyPlanningRecord.providerDoctor.profession,
        patient: row.familyPlanningRecord.patient,
      })),
    ];
  }

  /**
   * The category and anchors of every live clinical file of these patients
   * in the required categories. The title, notes and bytes are not selected:
   * the recap may say a partograf is filed, never what it says (D-033).
   */
  async listDocuments(params: {
    readonly patientIds: readonly string[];
    readonly categories: readonly DocumentCategoryValue[];
  }): Promise<NonCapitationDocumentSource[]> {
    if (params.patientIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        purpose: 'PATIENT_CLINICAL',
        patientId: { in: [...params.patientIds] },
        category: { in: [...params.categories] },
      },
      select: {
        patientId: true,
        encounterId: true,
        admissionId: true,
        category: true,
        documentDate: true,
        createdAt: true,
      },
    });
    return rows.flatMap((row) =>
      row.patientId === null || row.category === null
        ? []
        : [
            {
              patientId: row.patientId,
              encounterId: row.encounterId,
              admissionId: row.admissionId,
              category: row.category,
              filedOn: (row.documentDate ?? row.createdAt).toISOString().slice(0, 10),
            },
          ],
    );
  }

  async listMarks(sourceIds: readonly string[]): Promise<NonCapitationMarkSource[]> {
    if (sourceIds.length === 0) {
      return [];
    }
    return this.prisma.bpjsNonCapitationClaimMark.findMany({
      where: { sourceId: { in: [...sourceIds] } },
      select: { serviceType: true, sourceId: true, markedAt: true },
    });
  }

  /**
   * Marks lines sent, skipping any already marked. Returns the keys that
   * were newly written, so the caller audits only those and a second mark is
   * a no-op end to end.
   */
  async createMarks(params: {
    readonly items: readonly { serviceType: NonCapitationServiceTypeValue; sourceId: string }[];
    readonly claimMonth: string;
    readonly markedById: string;
  }): Promise<{ serviceType: NonCapitationServiceTypeValue; sourceId: string }[]> {
    if (params.items.length === 0) {
      return [];
    }
    const created = await this.prisma.bpjsNonCapitationClaimMark.createManyAndReturn({
      data: params.items.map((item) => ({
        serviceType: item.serviceType,
        sourceId: item.sourceId,
        claimMonth: toDateOnly(params.claimMonth),
        markedById: params.markedById,
      })),
      skipDuplicates: true,
      select: { serviceType: true, sourceId: true },
    });
    return created;
  }
}
