import type {
  AcceptorTypeValue,
  ContraceptiveDiscontinuationReasonValue,
  ContraceptiveMethodValue,
} from '#maternal-care/family-planning-schemas';

/** One follow-up of a course (P25-T14). Dates are `YYYY-MM-DD`. */
export type FamilyPlanningServiceView = {
  id: string;
  encounterId: string | null;
  servedOn: string;
  action: string;
  nextDueOn: string | null;
};

/** One course, with its follow-ups oldest first (P25-T14). */
export type FamilyPlanningCourseView = {
  id: string;
  patientId: string;
  method: ContraceptiveMethodValue;
  acceptorType: AcceptorTypeValue;
  startedOn: string;
  providerDoctorId: string;
  providerName: string;
  startEncounterId: string | null;
  /** Set for KB pasca salin: the birth this course follows. */
  deliveryRecordId: string | null;
  /** The pelimpahan an IUD was started under, when not her own authority. */
  mandateId: string | null;
  nextDueOn: string | null;
  sideEffects: string | null;
  discontinuedOn: string | null;
  discontinuationReason: ContraceptiveDiscontinuationReasonValue | null;
  isLive: boolean;
  services: FamilyPlanningServiceView[];
};

/** A recent birth no course has claimed, offered as KB pasca salin. */
export type FamilyPlanningDeliveryCandidateView = {
  deliveryRecordId: string;
  birthAt: string;
};

/** What the KB tab reads: the live course, the history, and a pasca salin prompt. */
export type PatientFamilyPlanningResponse = {
  liveCourse: FamilyPlanningCourseView | null;
  /** Every course, newest first, the live one included. */
  courses: FamilyPlanningCourseView[];
  postDeliveryCandidate: FamilyPlanningDeliveryCandidateView | null;
};

/** One line of the due list: a live course due within the window or overdue. */
export type FamilyPlanningDueItem = {
  familyPlanningRecordId: string;
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  method: ContraceptiveMethodValue;
  nextDueOn: string;
  /** Negative when overdue, 0 on the day. */
  daysUntilDue: number;
};
