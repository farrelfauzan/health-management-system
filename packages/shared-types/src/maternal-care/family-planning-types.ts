import type { DoctorAuthorityKindValue } from '#doctor-management/schemas';
import type {
  AcceptorTypeValue,
  ContraceptiveDiscontinuationReasonValue,
  ContraceptiveMethodValue,
} from '#maternal-care/family-planning-schemas';

/** What a midwife needs before she may start or continue a method (P25-T14). */
export type FamilyPlanningAuthorityGate = {
  kind: DoctorAuthorityKindValue;
  /**
   * The ICD-9-CM code a P25-T05 mandate must name to cover the method, or
   * null when no code names it — then only her own authority will do.
   */
  procedureCode: string | null;
};

/** The row `family_planning_services` holds, as the repository returns it. */
export type FamilyPlanningServiceRecord = {
  id: string;
  encounterId: string | null;
  servedOn: Date;
  action: string;
  nextDueOn: Date | null;
};

/** One course with its provider's name and its follow-ups, oldest first. */
export type FamilyPlanningCourseRecord = {
  id: string;
  patientId: string;
  method: ContraceptiveMethodValue;
  acceptorType: AcceptorTypeValue;
  startedOn: Date;
  providerDoctorId: string;
  providerDoctor: { fullName: string };
  startEncounterId: string | null;
  deliveryRecordId: string | null;
  mandateId: string | null;
  nextDueOn: Date | null;
  sideEffects: string | null;
  discontinuedOn: Date | null;
  discontinuationReason: ContraceptiveDiscontinuationReasonValue | null;
  services: FamilyPlanningServiceRecord[];
};

export type CreateFamilyPlanningCoursePayload = {
  patientId: string;
  method: ContraceptiveMethodValue;
  acceptorType: AcceptorTypeValue;
  startedOn: Date;
  providerDoctorId: string;
  startEncounterId: string | null;
  deliveryRecordId: string | null;
  mandateId: string | null;
  nextDueOn: Date | null;
  sideEffects: string | null;
};

/** A service, and the due date it moves the course to, written together. */
export type CreateFamilyPlanningServicePayload = {
  familyPlanningRecordId: string;
  encounterId: string | null;
  servedOn: Date;
  action: string;
  nextDueOn: Date | null;
  sideEffects: string | null;
};

export type DiscontinueFamilyPlanningCoursePayload = {
  id: string;
  discontinuedOn: Date;
  reason: ContraceptiveDiscontinuationReasonValue;
};

/** The clinician a course is started under, and what her profession is. */
export type FamilyPlanningProviderRecord = {
  id: string;
  profession: string;
};

/** Who a patient belongs to, for the own-scope reach check. */
export type FamilyPlanningPatientRecord = {
  id: string;
  ownerUserId: string | null;
};

/** The patient an encounter or a delivery belongs to, for the link check. */
export type FamilyPlanningLinkRecord = {
  id: string;
  patientId: string;
};

/** A live course due within the window, with who it belongs to. */
export type FamilyPlanningDueRecord = {
  id: string;
  patientId: string;
  method: ContraceptiveMethodValue;
  nextDueOn: Date;
  patient: { fullName: string; mrn: string };
};

/**
 * Whose due list this is: everything for an ANY-scope reader; for OWN, the
 * courses she provides, the patients assigned to her doctor profile, and her
 * own record when she is the patient.
 */
export type FamilyPlanningDueScope =
  | { hasAny: true }
  | { hasAny: false; ownerUserId: string; doctorId: string | null };

/** A recent birth that no course has claimed yet, for the KB pasca salin prompt. */
export type FamilyPlanningDeliveryCandidateRecord = {
  id: string;
  birthAt: Date;
};
