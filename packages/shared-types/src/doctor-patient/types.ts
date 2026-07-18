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
