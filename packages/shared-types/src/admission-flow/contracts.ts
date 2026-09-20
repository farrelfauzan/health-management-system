import type { AdmissionStatusValue, DischargeDispositionValue } from '#admission-flow/schemas';
import type { RoomClassSummary } from '#room-management/contracts';

export type AdmissionBedResponse = {
  id: string;
  code: string;
  room: {
    id: string;
    code: string;
    name: string;
    roomClass: RoomClassSummary;
  };
  ward: {
    id: string;
    code: string;
    name: string;
  };
};

export type BedAssignmentResponse = {
  id: string;
  bed: AdmissionBedResponse;
  startedAt: string;
  endedAt?: string;
};

export type AdmissionResponse = {
  id: string;
  patientId: string;
  patient: {
    id: string;
    mrn: string;
    fullName: string;
  };
  admittingDoctorId: string;
  admittingDoctor: {
    id: string;
    fullName: string;
  };
  sourceEncounterId?: string;
  status: AdmissionStatusValue;
  reason?: string;
  admittedAt: string;
  dischargedAt?: string;
  dischargeSummary?: string;
  /** How the stay ended (P24-T08). Absent on a stay discharged before it. */
  dischargeDisposition?: DischargeDispositionValue;
  dischargeDispositionNote?: string;
  /**
   * The code the SATUSEHAT bundle sends for that disposition, computed rather
   * than stored: a death splits into `exp-lt48h` and `exp-gt48h` by how long
   * the stay lasted. Present on a discharged stay only. P25-T15's death
   * reporting reads it here rather than re-deriving the split.
   */
  satusehatDischargeDispositionCode?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** Null once the stay ends — the last assignment is closed on discharge. */
  currentBed?: AdmissionBedResponse;
  /** The full bed history, oldest first. What IMP-15 prices night by night. */
  bedAssignments: BedAssignmentResponse[];
  createdAt: string;
  updatedAt: string;
};

export type AdmissionsListMeta = {
  page: number;
  limit: number;
  total: number;
};
