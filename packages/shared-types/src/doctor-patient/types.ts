import type { DoctorPatientActivityAction } from '#doctor-patient/schemas';

export type ListActivitiesParams = {
  page: number;
  limit: number;
  doctorId?: string;
  patientId?: string;
  action?: DoctorPatientActivityAction;
  actorUserId?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
};

export type CreateAssignmentPayload = {
  doctorId: string;
  patientId: string;
  actorUserId: string;
};

export type UnassignAssignmentPayload = {
  assignmentId: string;
  actorUserId: string;
};

export type AssignmentRecord = {
  id: string;
  doctorId: string;
  patientId: string;
  assignedById: string | null;
  assignedAt: Date;
  unassignedById: string | null;
  unassignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ActivityRecord = {
  id: string;
  assignmentId: string;
  action: DoctorPatientActivityAction;
  actorUserId: string;
  occurredAt: Date;
  assignment: {
    doctorId: string;
    patientId: string;
  };
};

/**
 * What a PATIENT_ASSIGNED notification is raised from (D-048): one patient
 * put on the care team of one or more clinician profiles. `actorUserId` made
 * the assignment and is never told about it.
 */
export type PatientAssignedNotice = {
  doctorIds: readonly string[];
  patientId: string;
  patientName: string;
  actorUserId: string;
};

/** The account behind a clinician profile, for addressing a notification. */
export type ClinicianAccountRecord = {
  doctorId: string;
  ownerUserId: string | null;
};
