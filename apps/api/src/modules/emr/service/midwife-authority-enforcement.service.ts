import {
  AssertMidwifeProcedureAuthorityParams,
  CHILD_VISIT_PURPOSE_INVALID_ERROR_CODE,
  CHILD_VISIT_PURPOSE_REQUIRED_ERROR_CODE,
  DoctorAuthorityKindValue,
  EncounterChildVisitPurposeValue,
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
import { buildMidwifeAuthorityRequiredException } from '../../doctor-management/service/build-midwife-authority-required-exception';
import { DoctorAuthorityService } from '../../doctor-management/service/doctor-authority.service';
import { DoctorMandateService } from '../../doctor-management/service/doctor-mandate.service';

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
    private readonly doctorMandateService: DoctorMandateService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Decides what a midwife is recording this procedure under, and refuses it
   * when the answer is nothing (P25-T03, extended by P25-T05).
   *
   * Her own authority comes first: with an active one of the kind the action
   * needs, she acts in her own right and the row carries no mandate. Failing
   * that, a live pelimpahan naming this code covers it, and the id comes back
   * so the row records **who answers for the action**. A mandate also covers a
   * code that needs no authority at all, which is why it is looked up for
   * every procedure a midwife records rather than only for gated ones.
   *
   * Only when neither holds is the action refused — audited first, because
   * `AuditInterceptor` never writes on a 4xx.
   *
   * Everything is judged on the clinic-local day the action was *performed*,
   * so a backdated entry is judged on the day it happened.
   */
  async resolveProcedureMandate(
    params: AssertMidwifeProcedureAuthorityParams,
  ): Promise<string | null> {
    if (params.encounter.doctor.profession !== 'MIDWIFE') {
      return null;
    }
    const doctorId = params.encounter.doctorId;
    const onDate = this.toClinicDate(params.performedAt ?? new Date());
    const kind = resolveMidwifeProcedureAuthorityKind({
      code: params.code,
      contraceptiveImplantAction: params.contraceptiveImplantAction,
    });
    if (kind !== null && (await this.doctorAuthorityService.hasActiveAuthority({ doctorId, kind, onDate }))) {
      // Her own authority. A mandate she also happens to hold does not take
      // the action away from her, so nothing is stamped.
      return null;
    }
    const mandate = await this.doctorMandateService.findCoveringMandate({
      midwifeDoctorId: doctorId,
      icd9cmCode: params.code.trim(),
      // The repository compares against a DATE column, so the clinic-local
      // calendar day travels as a date rather than as the instant it was.
      onDate: new Date(`${onDate}T00:00:00.000Z`),
    });
    if (mandate !== null) {
      return mandate.id;
    }
    if (kind === null) {
      // Nothing to gate and nothing to attribute: an ordinary procedure any
      // midwife may record on her own.
      return null;
    }
    await this.auditService.record({
      action: AuditAction.MIDWIFE_AUTHORITY_REFUSED,
      resource: 'encounter-procedure',
      actorUserId: params.actorUserId,
      resourceId: params.encounter.id,
      patientId: params.encounter.patientId,
      metadata: { kind, code: params.code.trim(), encounterId: params.encounter.id, doctorId },
    });
    throw buildMidwifeAuthorityRequiredException(kind);
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
    throw buildMidwifeAuthorityRequiredException(kind);
  }

  private toClinicDate(instant: Date): string {
    return getCalendarDateInTimeZone(instant, this.clinicTimeZone);
  }
}
