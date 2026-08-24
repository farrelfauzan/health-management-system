import {
  AdmissionBedResponse,
  AdmissionRecord,
  AdmissionResponse,
  BedAssignmentRecord,
  BedAssignmentResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdmissionMapper {
  toAdmissionResponse(admission: AdmissionRecord): AdmissionResponse {
    const openAssignment = admission.bedAssignments.find(
      (assignment) => assignment.endedAt === null,
    );

    return {
      id: admission.id,
      patientId: admission.patientId,
      patient: {
        id: admission.patientId,
        mrn: admission.patientMrn,
        fullName: admission.patientFullName,
      },
      admittingDoctorId: admission.admittingDoctorId,
      admittingDoctor: {
        id: admission.admittingDoctorId,
        fullName: admission.admittingDoctorName,
      },
      sourceEncounterId: admission.sourceEncounterId ?? undefined,
      status: admission.status,
      reason: admission.reason ?? undefined,
      admittedAt: admission.admittedAt.toISOString(),
      dischargedAt: admission.dischargedAt?.toISOString(),
      dischargeSummary: admission.dischargeSummary ?? undefined,
      cancelledAt: admission.cancelledAt?.toISOString(),
      cancelReason: admission.cancelReason ?? undefined,
      currentBed: openAssignment ? this.toBedResponse(openAssignment) : undefined,
      bedAssignments: admission.bedAssignments.map((assignment) =>
        this.toBedAssignmentResponse(assignment),
      ),
      createdAt: admission.createdAt.toISOString(),
      updatedAt: admission.updatedAt.toISOString(),
    };
  }

  private toBedAssignmentResponse(assignment: BedAssignmentRecord): BedAssignmentResponse {
    return {
      id: assignment.id,
      bed: this.toBedResponse(assignment),
      startedAt: assignment.startedAt.toISOString(),
      endedAt: assignment.endedAt?.toISOString(),
    };
  }

  private toBedResponse(assignment: BedAssignmentRecord): AdmissionBedResponse {
    return {
      id: assignment.bed.id,
      code: assignment.bed.code,
      room: {
        id: assignment.bed.roomId,
        code: assignment.bed.roomCode,
        name: assignment.bed.roomName,
        roomClass: assignment.bed.roomClass,
      },
      ward: {
        id: assignment.bed.wardId,
        code: assignment.bed.wardCode,
        name: assignment.bed.wardName,
      },
    };
  }
}
