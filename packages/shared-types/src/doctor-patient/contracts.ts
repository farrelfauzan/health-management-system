import type { DoctorPatientActivityAction } from '#doctor-patient/schemas';

export type DoctorPatientAssignment = {
  id: string;
  doctorId: string;
  patientId: string;
  assignedById?: string;
  assignedAt: string;
  unassignedById?: string;
  unassignedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DoctorPatientActivityEvent = {
  id: string;
  assignmentId: string;
  doctorId: string;
  patientId: string;
  action: DoctorPatientActivityAction;
  actorUserId: string;
  occurredAt: string;
};

export type DoctorPatientActivityListMeta = {
  page: number;
  limit: number;
  total: number;
};
