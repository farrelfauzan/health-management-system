import { Injectable } from '@nestjs/common';

import {
  ChatChannelValue,
  ChatToolNameValue,
  ChatToolPatientAllergy,
  GetPatientSummaryToolResult,
  getPatientSummaryToolArgsSchema,
  getPatientSummaryToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { PatientManagementService } from '../../../patient-management/service/patient-management.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

const MILLISECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

/**
 * One assigned patient, summarised (P15-T06).
 *
 * **A doctor asking about someone else's patient gets the domain's own
 * refusal, unchanged.** `getPatientById` resolves the `:own` scope through the
 * `DoctorPatient` assignment table and throws `Forbidden` when the caller is
 * not assigned; the dispatch loop turns that into a `FAILED` lookup carrying
 * a typed code, so the attempt is visible in the transcript rather than
 * silently answered. That visibility is a `P15-T15` case, and it works
 * because nothing here catches or softens the domain's decision.
 *
 * **`getPatientIdentifiers` is never called, by any tool.** It is the audited
 * disclosure path for NIK and BPJS numbers and it has its own audit trail; a tool
 * reaching it would produce a disclosure with no audit record of who asked or
 * why. The summary below is built from `getPatientById` alone.
 */
@Injectable()
export class GetPatientSummaryTool implements ChatTool {
  readonly name: ChatToolNameValue = 'get_patient_summary';

  readonly description: string = [
    'Summary of one patient assigned to the asking doctor, by patient id.',
    'Ringkasan satu pasien yang ditugaskan kepada dokter yang bertanya, berdasarkan id pasien.',
    'Use for: "ringkasan pasien ini", "berapa umur pasien X", "apakah pasien punya alergi", "summarise this patient".',
    'Do NOT use for: NIK, nomor BPJS, nomor rekam medis, alamat atau nomor telepon — tidak pernah tersedia lewat tool. Jangan pakai untuk catatan klinis atau diagnosis.',
    'Requires a patientId returned by list_my_patients or list_my_appointments in an earlier turn — never guess one.',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['DOCTOR'];

  readonly allowedRoleCodes: readonly string[] = ['DOCTOR'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Patient', action: 'read', scope: 'OWN' };

  readonly argumentSchema = getPatientSummaryToolArgsSchema;

  constructor(private readonly patientManagementService: PatientManagementService) {}

  async execute(
    user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<GetPatientSummaryToolResult> {
    const { patientId } = getPatientSummaryToolArgsSchema.parse(validatedArguments);
    const patient = await this.patientManagementService.getPatientById(patientId, user);
    return projectToolResult(getPatientSummaryToolResultSchema, {
      patientId: patient.id,
      fullName: patient.fullName,
      ...(patient.sex === undefined ? {} : { sex: patient.sex }),
      ...this.toAgeYears(patient.dateOfBirth),
      status: patient.status,
      isActive: patient.isActive,
      assignedDoctorCount: patient.doctors.length,
      allergyCount: patient.allergies.length,
      allergies: patient.allergies.map((allergy) => this.toAllergy(allergy)),
      ...(patient.lastVisitAt === undefined ? {} : { lastVisitAt: patient.lastVisitAt }),
    });
  }

  /**
   * Age replaces the birth date rather than accompanying it. Every clinical
   * question a date of birth would answer here is answered by age in years,
   * and a birth date is a standard re-identification key while an age is not
   * — so the tool computes it and never copies the source field.
   *
   * An unparseable or absent date yields no field at all rather than a zero,
   * because "age 0" and "age unknown" are different clinical facts.
   */
  private toAgeYears(dateOfBirth: string | undefined): { ageYears?: number } {
    if (dateOfBirth === undefined) {
      return {};
    }
    const birthTimestamp = Date.parse(dateOfBirth);
    if (Number.isNaN(birthTimestamp)) {
      return {};
    }
    const ageYears = Math.floor((Date.now() - birthTimestamp) / MILLISECONDS_PER_YEAR);
    return ageYears < 0 ? {} : { ageYears };
  }

  /**
   * The allergy's free-text `reaction` is dropped, and its row id with it.
   * A coded allergen and a severity are a different risk class from a
   * sentence a clinician typed about a patient, and §8's line on free-text
   * clinical narrative applies to the latter wherever it appears.
   */
  private toAllergy(allergy: { substance: string; severity: string }): ChatToolPatientAllergy {
    return {
      substance: allergy.substance,
      severity: allergy.severity,
    };
  }
}
