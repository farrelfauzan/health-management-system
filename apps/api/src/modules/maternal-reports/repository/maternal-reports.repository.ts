import {
  MaternalReportAntenatalVisitSource,
  MaternalReportDeathSource,
  MaternalReportDeliverySource,
  MaternalReportEpisodeSource,
  MaternalReportFamilyPlanningSource,
  MaternalReportLabResultSource,
  MaternalReportMonthRange,
  MaternalReportNewbornRegisterSource,
  MaternalReportNewbornSource,
  MaternalReportPatientSource,
  MaternalReportPostnatalVisitSource,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const MILLISECONDS_PER_DAY = 86_400_000;
/** A baby is in her neonatal period for 28 days; the kohort bayi lists her that long. */
const NEONATAL_PERIOD_DAYS = 28;

const PATIENT_SELECT = {
  id: true,
  fullName: true,
  nikLast4: true,
  bpjsNumberLast4: true,
  dateOfBirth: true,
  address: true,
  villageCode: true,
  village: { select: { name: true } },
} satisfies Prisma.PatientProfileSelect;

const NEWBORN_INCLUDE = {
  newbornPatient: { select: { fullName: true, nikLast4: true } },
  hb0Immunization: { select: { occurredAt: true, deletedAt: true } },
  shkScreenings: { orderBy: { sequence: 'desc' }, take: 1 },
} satisfies Prisma.NewbornCareRecordInclude;

const ANTENATAL_VISIT_INCLUDE = {
  examination: true,
  encounter: {
    select: {
      startedAt: true,
      deletedAt: true,
      vitalSigns: { orderBy: { recordedAt: 'desc' }, select: { heightCm: true } },
      labOrders: {
        where: { status: { not: 'CANCELLED' } },
        select: {
          items: {
            select: {
              labTest: { select: { code: true, loincCode: true } },
              results: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AntenatalVisitInclude;

const POSTNATAL_VISIT_INCLUDE = {
  encounter: { select: { startedAt: true, deletedAt: true } },
  examination: { select: { perineumCondition: true } },
} satisfies Prisma.PostnatalVisitInclude;

type PatientRow = Prisma.PatientProfileGetPayload<{ select: typeof PATIENT_SELECT }>;
type NewbornRow = Prisma.NewbornCareRecordGetPayload<{ include: typeof NEWBORN_INCLUDE }>;
type AntenatalVisitRow = Prisma.AntenatalVisitGetPayload<{
  include: typeof ANTENATAL_VISIT_INCLUDE;
}>;
type PostnatalVisitRow = Prisma.PostnatalVisitGetPayload<{
  include: typeof POSTNATAL_VISIT_INCLUDE;
}>;
type DeliveryRow = Prisma.DeliveryRecordGetPayload<{
  include: {
    attendantDoctor: { select: { fullName: true } };
    newbornCareRecords: { include: typeof NEWBORN_INCLUDE };
  };
}>;

/**
 * Read-only Prisma access for the KIA registers and monthly reports
 * (P25-T15). Nothing here writes: the report is a projection of what the
 * maternal-care, laboratory, immunisation and admission modules recorded.
 * Only encounters and episodes carry a soft delete, so the deletion filter
 * sits on those and the child rows follow.
 */
@Injectable()
export class MaternalReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Pregnancies registered before the month ended and not ended before it began. */
  async listEpisodesActiveInMonth(
    range: MaternalReportMonthRange,
  ): Promise<MaternalReportEpisodeSource[]> {
    const rows = await this.prisma.pregnancyEpisode.findMany({
      where: {
        deletedAt: null,
        createdAt: { lt: range.endExclusive },
        OR: [{ endedAt: null }, { endedAt: { gte: range.startInclusive } }],
        patient: { deletedAt: null },
      },
      include: {
        patient: { select: PATIENT_SELECT },
        antenatalVisits: { include: ANTENATAL_VISIT_INCLUDE },
        deliveryRecord: {
          include: {
            attendantDoctor: { select: { fullName: true } },
            newbornCareRecords: { include: NEWBORN_INCLUDE },
            familyPlanningRecords: { select: { method: true }, orderBy: { startedOn: 'asc' } },
          },
        },
        postnatalVisits: { include: POSTNATAL_VISIT_INCLUDE },
      },
      orderBy: [{ patient: { fullName: 'asc' } }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      patient: this.toPatient(row.patient),
      estimatedDeliveryDate: row.estimatedDeliveryDate,
      gravida: row.gravida,
      para: row.para,
      abortus: row.abortus,
      bloodType: row.bloodType,
      rhesus: row.rhesus,
      riskNotes: row.riskNotes,
      antenatalVisits: this.toAntenatalVisits(row.id, row.antenatalVisits),
      delivery: row.deliveryRecord === null ? null : this.toDelivery(row.deliveryRecord),
      postnatalVisits: this.toPostnatalVisits(row.postnatalVisits),
      postpartumFamilyPlanningMethod: row.deliveryRecord?.familyPlanningRecords[0]?.method ?? null,
    }));
  }

  /** Antenatal visits whose encounter started inside the month, with their labs. */
  async listAntenatalVisitsInMonth(
    range: MaternalReportMonthRange,
  ): Promise<MaternalReportAntenatalVisitSource[]> {
    const rows = await this.prisma.antenatalVisit.findMany({
      where: {
        pregnancyEpisode: { deletedAt: null },
        encounter: {
          deletedAt: null,
          startedAt: { gte: range.startInclusive, lt: range.endExclusive },
        },
      },
      include: ANTENATAL_VISIT_INCLUDE,
    });
    return rows.map((row) => this.toAntenatalVisit(row.pregnancyEpisodeId, row));
  }

  /** Deliveries born inside the month, with the mother for the births report. */
  async listDeliveriesInMonth(
    range: MaternalReportMonthRange,
  ): Promise<(MaternalReportDeliverySource & { mother: MaternalReportPatientSource })[]> {
    const rows = await this.prisma.deliveryRecord.findMany({
      where: {
        birthAt: { gte: range.startInclusive, lt: range.endExclusive },
        pregnancyEpisode: { deletedAt: null },
      },
      include: {
        attendantDoctor: { select: { fullName: true } },
        newbornCareRecords: { include: NEWBORN_INCLUDE },
        pregnancyEpisode: { select: { patient: { select: PATIENT_SELECT } } },
      },
      orderBy: { birthAt: 'asc' },
    });
    return rows.map((row) => ({
      ...this.toDelivery(row),
      mother: this.toPatient(row.pregnancyEpisode.patient),
    }));
  }

  /**
   * Every postnatal visit of a mother or baby who had one inside the month,
   * so a KF or KN series can be judged complete from all its visits.
   */
  async listPostnatalVisitsTouchingMonth(
    range: MaternalReportMonthRange,
  ): Promise<MaternalReportPostnatalVisitSource[]> {
    const episodes = await this.prisma.pregnancyEpisode.findMany({
      where: {
        deletedAt: null,
        postnatalVisits: {
          some: {
            encounter: {
              deletedAt: null,
              startedAt: { gte: range.startInclusive, lt: range.endExclusive },
            },
          },
        },
      },
      select: { postnatalVisits: { include: POSTNATAL_VISIT_INCLUDE } },
    });
    return this.toPostnatalVisits(episodes.flatMap((episode) => episode.postnatalVisits));
  }

  /** Babies who were in their neonatal period at some point in the month. */
  async listNewbornsInNeonatalPeriod(
    range: MaternalReportMonthRange,
  ): Promise<MaternalReportNewbornRegisterSource[]> {
    const earliestBirth = new Date(
      range.startInclusive.getTime() - NEONATAL_PERIOD_DAYS * MILLISECONDS_PER_DAY,
    );
    const rows = await this.prisma.newbornCareRecord.findMany({
      where: {
        deliveryRecord: {
          birthAt: { gte: earliestBirth, lt: range.endExclusive },
          pregnancyEpisode: { deletedAt: null },
        },
      },
      include: {
        ...NEWBORN_INCLUDE,
        deliveryRecord: {
          select: {
            birthAt: true,
            pregnancyEpisode: { select: { patient: { select: PATIENT_SELECT } } },
          },
        },
        postnatalVisits: { include: POSTNATAL_VISIT_INCLUDE },
      },
      orderBy: { deliveryRecord: { birthAt: 'asc' } },
    });
    return rows.map((row) => ({
      newborn: this.toNewborn(row),
      birthAt: row.deliveryRecord.birthAt,
      mother: this.toPatient(row.deliveryRecord.pregnancyEpisode.patient),
      postnatalVisits: this.toPostnatalVisits(row.postnatalVisits),
    }));
  }

  /** HB0 doses on newborn records, by the dose's own date. */
  async listHb0GivenInMonth(range: MaternalReportMonthRange): Promise<Date[]> {
    const rows = await this.prisma.immunization.findMany({
      where: {
        deletedAt: null,
        occurredAt: { gte: range.startInclusive, lt: range.endExclusive },
        newbornCareRecords: { some: {} },
      },
      select: { occurredAt: true },
    });
    return rows.map((row) => row.occurredAt);
  }

  /** KB courses live on any day of the month. */
  async listFamilyPlanningLiveInMonth(
    range: MaternalReportMonthRange,
  ): Promise<MaternalReportFamilyPlanningSource[]> {
    const rows = await this.prisma.familyPlanningRecord.findMany({
      where: {
        startedOn: { lte: new Date(`${range.lastDay}T00:00:00.000Z`) },
        OR: [
          { discontinuedOn: null },
          { discontinuedOn: { gte: new Date(`${range.firstDay}T00:00:00.000Z`) } },
        ],
        patient: { deletedAt: null },
      },
      include: {
        patient: { select: PATIENT_SELECT },
        providerDoctor: { select: { fullName: true } },
        services: { orderBy: { servedOn: 'asc' } },
      },
      orderBy: [{ patient: { fullName: 'asc' } }, { startedOn: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      patient: this.toPatient(row.patient),
      method: row.method,
      acceptorType: row.acceptorType,
      startedOn: row.startedOn,
      nextDueOn: row.nextDueOn,
      discontinuedOn: row.discontinuedOn,
      discontinuationReason: row.discontinuationReason,
      sideEffects: row.sideEffects,
      isPostpartum: row.deliveryRecordId !== null,
      providerName: row.providerDoctor.fullName,
      services: row.services.map((service) => ({
        servedOn: service.servedOn,
        action: service.action,
        nextDueOn: service.nextDueOn,
      })),
    }));
  }

  /** Stays that ended in death inside the month, with what classifies the patient. */
  async listDeathsInMonth(range: MaternalReportMonthRange): Promise<MaternalReportDeathSource[]> {
    const rows = await this.prisma.admission.findMany({
      where: {
        deletedAt: null,
        dischargeDisposition: 'DIED',
        dischargedAt: { gte: range.startInclusive, lt: range.endExclusive },
      },
      include: {
        patient: {
          select: {
            ...PATIENT_SELECT,
            newbornCareRecord: { select: { id: true } },
            pregnancyEpisodes: { where: { deletedAt: null }, select: { endedAt: true } },
          },
        },
      },
      orderBy: { dischargedAt: 'asc' },
    });
    return rows.flatMap((row) =>
      row.dischargedAt === null
        ? []
        : [
            {
              admissionId: row.id,
              patient: this.toPatient(row.patient),
              dischargedAt: row.dischargedAt,
              isRegisteredNewborn: row.patient.newbornCareRecord !== null,
              pregnancyEndDates: row.patient.pregnancyEpisodes.map((episode) => episode.endedAt),
            },
          ],
    );
  }

  private toPatient(row: PatientRow): MaternalReportPatientSource {
    return {
      id: row.id,
      fullName: row.fullName,
      nikLast4: row.nikLast4,
      dateOfBirth: row.dateOfBirth,
      address: row.address,
      villageCode: row.villageCode,
      villageName: row.village?.name ?? null,
      hasBpjsNumber: row.bpjsNumberLast4 !== null,
    };
  }

  private toAntenatalVisits(
    pregnancyEpisodeId: string,
    rows: AntenatalVisitRow[],
  ): MaternalReportAntenatalVisitSource[] {
    return rows
      .filter((row) => row.encounter.deletedAt === null)
      .sort(
        (left, right) => left.encounter.startedAt.getTime() - right.encounter.startedAt.getTime(),
      )
      .map((row) => this.toAntenatalVisit(pregnancyEpisodeId, row));
  }

  private toAntenatalVisit(
    pregnancyEpisodeId: string,
    row: AntenatalVisitRow,
  ): MaternalReportAntenatalVisitSource {
    const height = row.encounter.vitalSigns.find((vitals) => vitals.heightCm !== null);
    return {
      pregnancyEpisodeId,
      visitCode: row.visitCode,
      startedAt: row.encounter.startedAt,
      heightCm: height?.heightCm?.toNumber() ?? null,
      muacCm: row.examination?.muacCm?.toNumber() ?? null,
      tetanusStatus: row.examination?.tetanusStatus ?? null,
      counsellingTopics: row.examination?.counsellingTopics ?? [],
      caseManagementNotes: row.examination?.caseManagementNotes ?? null,
      labResults: row.encounter.labOrders.flatMap((order) =>
        order.items.flatMap((item): MaternalReportLabResultSource[] => {
          const result = item.results[0];
          return result === undefined
            ? []
            : [
                {
                  testCode: item.labTest.code,
                  loincCode: item.labTest.loincCode,
                  valueNumeric: result.valueNumeric?.toNumber() ?? null,
                  valueCoded: result.valueCoded,
                  valueText: result.valueText,
                },
              ];
        }),
      ),
    };
  }

  private toDelivery(row: DeliveryRow): MaternalReportDeliverySource {
    return {
      birthAt: row.birthAt,
      mode: row.mode,
      attendantName: row.attendantDoctor.fullName,
      perinealTearGrade: row.perinealTearGrade,
      referredOut: row.referredOut,
      referralReason: row.referralReason,
      newborns: row.newbornCareRecords.map((newborn) => this.toNewborn(newborn)),
    };
  }

  private toNewborn(row: NewbornRow): MaternalReportNewbornSource {
    const hb0 = row.hb0Immunization;
    const shk = row.shkScreenings[0];
    return {
      id: row.id,
      outcome: row.outcome,
      sex: row.sex,
      fullName: row.newbornPatient?.fullName ?? null,
      nikLast4: row.newbornPatient?.nikLast4 ?? null,
      birthWeightGrams: row.birthWeightGrams,
      lengthCm: row.lengthCm?.toNumber() ?? null,
      imdStartedAt: row.imdStartedAt,
      vitaminK1GivenAt: row.vitaminK1GivenAt,
      eyeProphylaxisGivenAt: row.eyeProphylaxisGivenAt,
      hb0GivenAt: hb0 === null || hb0.deletedAt !== null ? null : hb0.occurredAt,
      shkSampleTakenAt: shk?.sampleTakenAt ?? null,
      shkResult: shk?.result ?? null,
    };
  }

  private toPostnatalVisits(rows: PostnatalVisitRow[]): MaternalReportPostnatalVisitSource[] {
    return rows
      .filter((row) => row.encounter.deletedAt === null)
      .sort(
        (left, right) => left.encounter.startedAt.getTime() - right.encounter.startedAt.getTime(),
      )
      .map((row) => ({
        pregnancyEpisodeId: row.pregnancyEpisodeId,
        newbornCareRecordId: row.newbornCareRecordId,
        subject: row.subject,
        visitCode: row.visitCode,
        startedAt: row.encounter.startedAt,
        caseManagementNote: row.examination?.perineumCondition ?? null,
      }));
  }
}
