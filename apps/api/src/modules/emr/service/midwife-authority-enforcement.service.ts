import {
  AssertMidwifeProcedureAuthorityParams,
  CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE,
  CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE,
  DoctorAuthorityKindValue,
  EncounterChildVisitPurposeValue,
  MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE,
  NEONATAL_FIRST_AID_MAX_AGE_DAYS,
  ResolveChildVisitPurposeParams,
  getCalendarDateInTimeZone,
  isChildVisitPurposeRequired,
  resolveMidwifeProcedureAuthorityKind,
  toPatientAgeInDays,
} from '@hms/shared-types';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { DoctorAuthorityService } from '../../doctor-management/service/doctor-authority.service';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * Acts on the authorities P25-T02 records (P25-T03). Two decisions, both
 * taken before anything is written and both only for a `MIDWIFE` — a doctor
 * is never checked:
 *
 * - a procedure that needs a delegated authority (FR-AUTH-02): IUD insertion
 *   or removal by code, and any contraceptive implant by flag;
 * - the purpose of a visit for a child under five (FR-AUTH-03), where only
 *   `SICK_CHILD` needs MTBS.
 *
 * A refusal is audited explicitly and then thrown as a 422, because
 * `AuditInterceptor` never writes on a 4xx. The legal basis the refusal
 * rests on is PP 28/2024 Pasal 744 (D-036).
 */
@Injectable()
export class MidwifeAuthorityEnforcementService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly doctorAuthorityService: DoctorAuthorityService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Refuses the procedure when the encounter's clinician is a midwife without
   * an active authority of the kind it needs on the clinic-local day it was
   * performed — so a backdated entry is judged on the day it happened.
   */
  async assertProcedureAllowed(params: AssertMidwifeProcedureAuthorityParams): Promise<void> {
    if (params.encounter.doctor.profession !== 'MIDWIFE') {
      return;
    }
    const kind = resolveMidwifeProcedureAuthorityKind({
      code: params.code,
      contraceptiveImplantAction: params.contraceptiveImplantAction,
    });
    if (kind === null) {
      return;
    }
    const doctorId = params.encounter.doctorId;
    const onDate = this.toClinicDate(params.performedAt ?? new Date());
    if (await this.doctorAuthorityService.hasActiveAuthority({ doctorId, kind, onDate })) {
      return;
    }
    await this.auditService.record({
      action: AuditAction.MIDWIFE_AUTHORITY_REFUSED,
      resource: 'encounter-procedure',
      actorUserId: params.actorUserId,
      resourceId: params.encounter.id,
      patientId: params.encounter.patientId,
      metadata: { kind, code: params.code.trim(), encounterId: params.encounter.id, doctorId },
    });
    throw this.buildAuthorityRequiredException(kind);
  }

  /**
   * The purpose to store on a new encounter: the requested one when the rule
   * applies and allows it, `null` whenever the rule does not apply (a doctor,
   * or a patient of 60 months or more) — the field is then ignored.
   */
  async resolveChildVisitPurpose(
    params: ResolveChildVisitPurposeParams,
  ): Promise<EncounterChildVisitPurposeValue | null> {
    const today = this.toClinicDate(new Date());
    const asOf = new Date(`${today}T00:00:00.000Z`);
    const isRequired = isChildVisitPurposeRequired({
      profession: params.clinician.profession,
      dateOfBirth: params.patient.dateOfBirth,
      asOf,
    });
    if (!isRequired) {
      return null;
    }
    const purpose = this.requirePurpose(params.requestedPurpose);
    this.assertPurposeFitsAge({ purpose, dateOfBirth: params.patient.dateOfBirth, asOf });
    if (purpose === 'SICK_CHILD') {
      await this.assertSickChildAllowed({ ...params, onDate: today });
    }
    return purpose;
  }

  private requirePurpose(
    purpose: EncounterChildVisitPurposeValue | undefined,
  ): EncounterChildVisitPurposeValue {
    if (purpose === undefined) {
      throw new UnprocessableEntityException({
        code: CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE,
        message: 'A midwife must name the purpose of a visit for a child under five',
      });
    }
    return purpose;
  }

  private assertPurposeFitsAge(params: {
    purpose: EncounterChildVisitPurposeValue;
    dateOfBirth: Date;
    asOf: Date;
  }): void {
    if (params.purpose !== 'NEONATAL_FIRST_AID') {
      return;
    }
    const ageInDays = toPatientAgeInDays({ dateOfBirth: params.dateOfBirth, asOf: params.asOf });
    if (ageInDays > NEONATAL_FIRST_AID_MAX_AGE_DAYS) {
      throw new UnprocessableEntityException({
        code: CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE,
        message: `Neonatal first aid applies only to a baby aged ${NEONATAL_FIRST_AID_MAX_AGE_DAYS} days or less`,
      });
    }
  }

  private async assertSickChildAllowed(
    params: ResolveChildVisitPurposeParams & { onDate: string },
  ): Promise<void> {
    const kind: DoctorAuthorityKindValue = 'MTBS';
    const doctorId = params.clinician.id;
    if (
      await this.doctorAuthorityService.hasActiveAuthority({ doctorId, kind, onDate: params.onDate })
    ) {
      return;
    }
    await this.auditService.record({
      action: AuditAction.MIDWIFE_AUTHORITY_REFUSED,
      resource: 'encounter',
      actorUserId: params.actorUserId,
      resourceId: params.registrationId,
      patientId: params.patient.id,
      metadata: {
        kind,
        childVisitPurpose: 'SICK_CHILD',
        registrationId: params.registrationId,
        doctorId,
      },
    });
    throw this.buildAuthorityRequiredException(kind);
  }

  private buildAuthorityRequiredException(
    kind: DoctorAuthorityKindValue,
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE,
      message: `This midwife holds no active ${kind} authority (PP 28/2024 Pasal 744); refer the patient to a doctor or a puskesmas`,
      errors: { kind },
    });
  }

  private toClinicDate(instant: Date): string {
    return getCalendarDateInTimeZone(instant, this.clinicTimeZone);
  }
}
