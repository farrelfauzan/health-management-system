import {
  AdmissionBedResponse,
  AdmissionRecord,
  AdmissionResponse,
  BedAssignmentRecord,
  BedAssignmentResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { resolveSatusehatDischargeDisposition } from '../../../common/satusehat/resolve-satusehat-discharge-disposition';

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
      dischargeDisposition: admission.dischargeDisposition ?? undefined,
      dischargeDispositionNote: admission.dischargeDispositionNote ?? undefined,
      satusehatDischargeDispositionCode: this.resolveDischargeDispositionCode(admission),
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

  /**
   * The code the SATUSEHAT bundle would send for this stay (P24-T08), so a
   * reader — P25-T15's death reporting above all — does not have to re-derive
   * the under/over-48-hour split a death is coded by. Absent while the patient
   * is still in a bed: nothing has ended, so nothing has a disposition yet.
   */
  private resolveDischargeDispositionCode(admission: AdmissionRecord): string | undefined {
    if (admission.dischargedAt === null) {
      return undefined;
    }
    return resolveSatusehatDischargeDisposition({
      disposition: admission.dischargeDisposition,
      admittedAt: admission.admittedAt,
      dischargedAt: admission.dischargedAt,
    }).code;
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
