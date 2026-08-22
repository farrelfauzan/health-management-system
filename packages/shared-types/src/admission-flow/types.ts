import type { AdmissionStatusValue } from '#admission-flow/schemas';
import type { RoomClassSummaryRecord } from '#room-management/types';

/** Where a bed is, flattened for display on an admission row. */
export type AdmissionBedRecord = {
  id: string;
  code: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  roomClass: RoomClassSummaryRecord;
  wardId: string;
  wardCode: string;
  wardName: string;
};

/**
 * One row of the stay's bed history. `endedAt` null means the patient is in
 * this bed now — and, via the partial unique index, that no one else is.
 */
export type BedAssignmentRecord = {
  id: string;
  admissionId: string;
  bed: AdmissionBedRecord;
  startedAt: Date;
  endedAt: Date | null;
};

export type AdmissionRecord = {
  id: string;
  patientId: string;
  patientMrn: string;
  patientFullName: string;
  /** The user account the patient record belongs to, for OWN-scope checks. */
  patientOwnerUserId: string | null;
  admittingDoctorId: string;
  admittingDoctorName: string;
  /** The user account the admitting doctor signs in as, for OWN-scope checks. */
  admittingDoctorOwnerUserId: string | null;
  sourceEncounterId: string | null;
  status: AdmissionStatusValue;
  reason: string | null;
  admittedAt: Date;
  dischargedAt: Date | null;
  dischargeSummary: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  bedAssignments: BedAssignmentRecord[];
};

export type ListAdmissionsParams = {
  page: number;
  limit: number;
  status?: AdmissionStatusValue;
  patientId?: string;
  admittingDoctorId?: string;
  wardId?: string;
  search?: string;
  /**
   * Set only under OWN scope. Narrows the list to stays the caller admitted,
   * stays for a patient whose record they own, and stays for a patient they
   * are currently assigned to — reading the ward round is part of doing it.
   */
  ownerUserId?: string;
};

export type AdmitPatientRecordPayload = {
  patientId: string;
  admittingDoctorId: string;
  bedId: string;
  sourceEncounterId?: string;
  reason?: string;
  admittedAt: Date;
  createdById?: string;
};

export type TransferAdmissionRecordPayload = {
  admissionId: string;
  currentAssignmentId: string;
  currentBedId: string;
  targetBedId: string;
  effectiveAt: Date;
  createdById?: string;
};

export type DischargeAdmissionRecordPayload = {
  admissionId: string;
  currentAssignmentId: string;
  currentBedId: string;
  dischargedAt: Date;
  dischargeSummary?: string;
};

export type CancelAdmissionRecordPayload = {
  admissionId: string;
  currentAssignmentId: string | null;
  currentBedId: string | null;
  cancelledAt: Date;
  cancelReason: string;
};

export type UpdateAdmissionRecordPayload = {
  id: string;
  reason?: string;
  admittingDoctorId?: string;
};

/**
 * Which constraint a concurrent write lost on. The repository translates the
 * database's index name into one of these so the service can say what actually
 * happened rather than "conflict".
 */
export type AdmissionConflictReason = 'bed-occupied' | 'patient-already-admitted';
