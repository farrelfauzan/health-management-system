import { getCalendarDateInTimeZone } from '#registration-flow/schemas';
import type { NonCapitationServiceTypeValue } from '#bpjs-non-capitation/schemas';
import type {
  NonCapitationAntenatalSource,
  NonCapitationDeliverySource,
  NonCapitationFamilyPlanningSource,
  NonCapitationPostnatalSource,
  NonCapitationRecapSources,
  NonCapitationUnit,
} from '#bpjs-non-capitation/types';

type UnitSources = Pick<
  NonCapitationRecapSources,
  'antenatal' | 'postnatal' | 'deliveries' | 'familyPlanning'
>;

const INJECTABLE_METHODS = new Set(['INJECTABLE_1_MONTH', 'INJECTABLE_3_MONTH']);

function resolveAntenatalServiceType(
  source: NonCapitationAntenatalSource,
): NonCapitationServiceTypeValue {
  if (source.examinerProfession === 'MIDWIFE') {
    return 'ANTENATAL_MIDWIFE';
  }
  return source.hasUltrasound ? 'ANTENATAL_DOCTOR_ULTRASOUND' : 'ANTENATAL_DOCTOR';
}

function buildPreReferralUnit(
  source: NonCapitationAntenatalSource | NonCapitationPostnatalSource,
  serviceDate: string,
): NonCapitationUnit {
  return {
    serviceType: 'PRE_REFERRAL',
    sourceId: source.encounterId,
    serviceDate,
    visitLabel: source.visitCode,
    examinerProfession: source.examinerProfession,
    patient: source.patient,
    documentPatientIds: [source.patient.id],
    encounterId: source.encounterId,
    admissionId: null,
  };
}

function deriveAntenatalUnits(
  source: NonCapitationAntenatalSource,
  timeZone: string,
): NonCapitationUnit[] {
  const serviceDate = getCalendarDateInTimeZone(source.startedAt, timeZone);
  const visit: NonCapitationUnit = {
    serviceType: resolveAntenatalServiceType(source),
    sourceId: source.antenatalVisitId,
    serviceDate,
    visitLabel: source.visitCode,
    examinerProfession: source.examinerProfession,
    patient: source.patient,
    documentPatientIds: [source.patient.id],
    encounterId: source.encounterId,
    admissionId: null,
  };
  return source.hasReferral ? [visit, buildPreReferralUnit(source, serviceDate)] : [visit];
}

/** KF1–KF3 are paid as a mother-and-newborn visit, KF4 as the mother's alone (Pasal 21 ayat (4)). */
function derivePostnatalUnits(
  source: NonCapitationPostnatalSource,
  timeZone: string,
): NonCapitationUnit[] {
  const serviceDate = getCalendarDateInTimeZone(source.startedAt, timeZone);
  const visit: NonCapitationUnit = {
    serviceType: source.visitCode === 'KF4' ? 'POSTNATAL_MOTHER' : 'POSTNATAL_MOTHER_NEWBORN',
    sourceId: source.postnatalVisitId,
    serviceDate,
    visitLabel: source.visitCode,
    examinerProfession: source.examinerProfession,
    patient: source.patient,
    documentPatientIds: [source.patient.id],
    encounterId: source.encounterId,
    admissionId: null,
  };
  return source.hasReferral ? [visit, buildPreReferralUnit(source, serviceDate)] : [visit];
}

/**
 * The attendant's profession stands for the team (D-043): a doctor attending
 * is the Pasal 20 ayat (2) huruf a–b team, a midwife attending the two-nakes
 * team with no doctor at the facility.
 */
function deriveDeliveryUnit(
  source: NonCapitationDeliverySource,
  timeZone: string,
): NonCapitationUnit {
  return {
    serviceType:
      source.attendantProfession === 'DOCTOR'
        ? 'DELIVERY_WITH_DOCTOR'
        : 'DELIVERY_HEALTH_WORKER_TEAM',
    sourceId: source.deliveryRecordId,
    serviceDate: getCalendarDateInTimeZone(source.birthAt, timeZone),
    visitLabel: null,
    examinerProfession: source.attendantProfession,
    patient: source.patient,
    documentPatientIds: [source.patient.id, ...source.newbornPatientIds],
    encounterId: null,
    admissionId: source.admissionId,
  };
}

/**
 * Which Pasal 22 line a KB act is, if any: an AKDR or implant **inserted
 * here** (a NEW acceptor's course start), and every injection — the course
 * start of an injectable, and each follow-up that set the next due date.
 * Pills, condoms and check-ups carry no non-capitation tariff.
 */
function resolveFamilyPlanningServiceType(
  source: NonCapitationFamilyPlanningSource,
): NonCapitationServiceTypeValue | null {
  if (INJECTABLE_METHODS.has(source.method)) {
    return source.kind === 'COURSE_START' || source.setsNextDueDate
      ? 'FAMILY_PLANNING_INJECTION'
      : null;
  }
  if (source.kind !== 'COURSE_START' || source.acceptorType !== 'NEW') {
    return null;
  }
  if (source.method === 'IUD') {
    return 'FAMILY_PLANNING_IUD';
  }
  return source.method === 'IMPLANT' ? 'FAMILY_PLANNING_IMPLANT' : null;
}

function deriveFamilyPlanningUnits(source: NonCapitationFamilyPlanningSource): NonCapitationUnit[] {
  const serviceType = resolveFamilyPlanningServiceType(source);
  if (serviceType === null) {
    return [];
  }
  return [
    {
      serviceType,
      sourceId: source.sourceId,
      serviceDate: source.servedOn.toISOString().slice(0, 10),
      visitLabel: null,
      examinerProfession: source.examinerProfession,
      patient: source.patient,
      documentPatientIds: [source.patient.id],
      encounterId: source.encounterId,
      admissionId: null,
    },
  ];
}

/**
 * Every payable unit the month's records hold (P25-T16), before pricing:
 * one per ANC visit, one pra rujukan per referring ANC or nifas visit, one per
 * birth, one per KF visit and one per claimable KB act. Timestamps become
 * clinic-local calendar dates here, once.
 */
export function deriveNonCapitationUnits(
  sources: UnitSources,
  timeZone: string,
): NonCapitationUnit[] {
  return [
    ...sources.antenatal.flatMap((source) => deriveAntenatalUnits(source, timeZone)),
    ...sources.deliveries.map((source) => deriveDeliveryUnit(source, timeZone)),
    ...sources.postnatal.flatMap((source) => derivePostnatalUnits(source, timeZone)),
    ...sources.familyPlanning.flatMap(deriveFamilyPlanningUnits),
  ];
}
