import {
  BpjsReferralRecord,
  BpjsReferralResponse,
  calculateBodyMassIndex,
  DiagnosisRecord,
  DiagnosisResponse,
  EncounterDetail,
  EncounterDetailRecord,
  EncounterListItem,
  EncounterResponse,
  EncounterWithRelationsRecord,
  ProcedureRecord,
  ProcedureResponse,
  VitalSignsRecord,
  VitalSignsResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/**
 * Turns persistence records into the API envelope's `data`. Shared by the
 * lifecycle and clinical-data services because both return the same shapes, and
 * because the derived fields — BMI above all — must be computed identically
 * wherever an encounter surfaces.
 */
@Injectable()
export class EncounterMapper {
  toEncounterListItem(encounter: EncounterWithRelationsRecord): EncounterListItem {
    return {
      ...this.toEncounterResponse(encounter),
      patient: {
        id: encounter.patient.id,
        mrn: encounter.patient.mrn,
        fullName: encounter.patient.fullName,
      },
      doctor: {
        id: encounter.doctor.id,
        licenseNumber: encounter.doctor.licenseNumber,
        fullName: encounter.doctor.fullName,
      },
      vitalSignsCount: encounter._count.vitalSigns,
      diagnosisCount: encounter._count.diagnoses,
      procedureCount: encounter._count.procedures,
    };
  }

  toEncounterDetail(encounter: EncounterDetailRecord): EncounterDetail {
    return {
      ...this.toEncounterResponse(encounter),
      patient: {
        id: encounter.patient.id,
        mrn: encounter.patient.mrn,
        fullName: encounter.patient.fullName,
      },
      doctor: {
        id: encounter.doctor.id,
        licenseNumber: encounter.doctor.licenseNumber,
        fullName: encounter.doctor.fullName,
      },
      vitalSigns: encounter.vitalSigns.map((row) => this.toVitalSignsResponse(row)),
      diagnoses: encounter.diagnoses.map((row) => this.toDiagnosisResponse(row)),
      procedures: encounter.procedures.map((row) => this.toProcedureResponse(row)),
      prescriptions: encounter.prescriptions.map((prescription) => ({
        id: prescription.id,
        status: prescription.status,
        issuedAt: prescription.issuedAt?.toISOString(),
        itemCount: prescription._count.items,
      })),
    };
  }

  toVitalSignsResponse(vitalSigns: VitalSignsRecord): VitalSignsResponse {
    const bodyMassIndex = calculateBodyMassIndex({
      heightCm: vitalSigns.heightCm,
      weightKg: vitalSigns.weightKg,
    });

    return {
      id: vitalSigns.id,
      encounterId: vitalSigns.encounterId,
      heightCm: vitalSigns.heightCm ?? undefined,
      weightKg: vitalSigns.weightKg ?? undefined,
      systolicBloodPressure: vitalSigns.systolicBloodPressure ?? undefined,
      diastolicBloodPressure: vitalSigns.diastolicBloodPressure ?? undefined,
      pulseRate: vitalSigns.pulseRate ?? undefined,
      respiratoryRate: vitalSigns.respiratoryRate ?? undefined,
      temperatureCelsius: vitalSigns.temperatureCelsius ?? undefined,
      oxygenSaturation: vitalSigns.oxygenSaturation ?? undefined,
      bodyMassIndex: bodyMassIndex ?? undefined,
      notes: vitalSigns.notes ?? undefined,
      recordedAt: vitalSigns.recordedAt.toISOString(),
      recordedById: vitalSigns.recordedById ?? undefined,
      createdAt: vitalSigns.createdAt.toISOString(),
      updatedAt: vitalSigns.updatedAt.toISOString(),
    };
  }

  toBpjsReferralResponse(referral: BpjsReferralRecord): BpjsReferralResponse {
    return {
      id: referral.id,
      encounterId: referral.encounterId,
      destinationProviderCode: referral.destinationProviderCode,
      subSpecialtyCode: referral.subSpecialtyCode ?? undefined,
      saranaCode: referral.saranaCode ?? undefined,
      khususCode: referral.khususCode ?? undefined,
      estimatedReferralDate: referral.estimatedReferralDate.toISOString().slice(0, 10),
      notes: referral.notes ?? undefined,
      createdAt: referral.createdAt.toISOString(),
      updatedAt: referral.updatedAt.toISOString(),
    };
  }

  toDiagnosisResponse(diagnosis: DiagnosisRecord): DiagnosisResponse {
    return {
      id: diagnosis.id,
      encounterId: diagnosis.encounterId,
      icd10CodeId: diagnosis.icd10CodeId ?? undefined,
      code: diagnosis.code,
      display: diagnosis.display,
      type: diagnosis.type,
      notes: diagnosis.notes ?? undefined,
      recordedAt: diagnosis.recordedAt.toISOString(),
      recordedById: diagnosis.recordedById ?? undefined,
      createdAt: diagnosis.createdAt.toISOString(),
      updatedAt: diagnosis.updatedAt.toISOString(),
    };
  }

  toProcedureResponse(procedure: ProcedureRecord): ProcedureResponse {
    return {
      id: procedure.id,
      encounterId: procedure.encounterId,
      icd9cmCodeId: procedure.icd9cmCodeId ?? undefined,
      code: procedure.code,
      display: procedure.display,
      notes: procedure.notes ?? undefined,
      performedAt: procedure.performedAt.toISOString(),
      recordedById: procedure.recordedById ?? undefined,
      createdAt: procedure.createdAt.toISOString(),
      updatedAt: procedure.updatedAt.toISOString(),
    };
  }

  private toEncounterResponse(
    encounter: EncounterDetailRecord | EncounterWithRelationsRecord,
  ): EncounterResponse {
    return {
      id: encounter.id,
      registrationId: encounter.registrationId,
      patientId: encounter.patientId,
      doctorId: encounter.doctorId,
      status: encounter.status,
      startedAt: encounter.startedAt.toISOString(),
      endedAt: encounter.endedAt?.toISOString(),
      subjective: encounter.subjective ?? undefined,
      objective: encounter.objective ?? undefined,
      assessment: encounter.assessment ?? undefined,
      plan: encounter.plan ?? undefined,
      createdById: encounter.createdById ?? undefined,
      createdAt: encounter.createdAt.toISOString(),
      updatedAt: encounter.updatedAt.toISOString(),
    };
  }
}
