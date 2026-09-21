import { ContraceptiveMethodValue, FAMILY_PLANNING_AUTHORITY_GATES } from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { buildMidwifeAuthorityRequiredException } from '../../doctor-management/service/build-midwife-authority-required-exception';
import { DoctorAuthorityService } from '../../doctor-management/service/doctor-authority.service';
import { DoctorMandateService } from '../../doctor-management/service/doctor-mandate.service';
import { FamilyPlanningRepository } from '../repository/family-planning.repository';

/**
 * The IUD/implant gate on a family planning course (P25-T14), the method-based
 * counterpart of the procedure gate P25-T03 put on encounters.
 *
 * Only a `MIDWIFE` provider is checked, and only for a gated method. Her own
 * active `IUD_IMPLANT` authority comes first; failing that, a live P25-T05
 * mandate naming the method's procedure code covers it and its id is returned
 * so the course records who answers for it. With neither, the refusal is
 * audited — `AuditInterceptor` never writes on a 4xx — and thrown as the same
 * 422 `MIDWIFE_AUTHORITY_REQUIRED` the encounter gate answers.
 */
@Injectable()
export class FamilyPlanningAuthorityService {
  constructor(
    private readonly familyPlanningRepository: FamilyPlanningRepository,
    private readonly doctorAuthorityService: DoctorAuthorityService,
    private readonly doctorMandateService: DoctorMandateService,
    private readonly auditService: AuditService,
  ) {}

  /** The mandate the course is started under, or null when none is needed. */
  async resolveMethodMandate(params: {
    method: ContraceptiveMethodValue;
    providerDoctorId: string;
    startedOn: string;
    patientId: string;
    actorUserId: string;
  }): Promise<string | null> {
    const provider = await this.familyPlanningRepository.findProvider(params.providerDoctorId);
    if (provider === null) {
      throw new NotFoundException('Provider clinician not found');
    }
    const gate = FAMILY_PLANNING_AUTHORITY_GATES[params.method];
    if (provider.profession !== 'MIDWIFE' || gate === undefined) {
      return null;
    }
    const doctorId = provider.id;
    if (
      await this.doctorAuthorityService.hasActiveAuthority({
        doctorId,
        kind: gate.kind,
        onDate: params.startedOn,
      })
    ) {
      return null;
    }
    const mandateId = await this.findCoveringMandateId({
      doctorId,
      procedureCode: gate.procedureCode,
      startedOn: params.startedOn,
    });
    if (mandateId !== null) {
      return mandateId;
    }
    await this.auditService.record({
      action: AuditAction.MIDWIFE_AUTHORITY_REFUSED,
      resource: 'family-planning-record',
      actorUserId: params.actorUserId,
      resourceId: params.patientId,
      patientId: params.patientId,
      metadata: { kind: gate.kind, method: params.method, doctorId },
    });
    throw buildMidwifeAuthorityRequiredException(gate.kind);
  }

  private async findCoveringMandateId(params: {
    doctorId: string;
    procedureCode: string | null;
    startedOn: string;
  }): Promise<string | null> {
    if (params.procedureCode === null) {
      return null;
    }
    const mandate = await this.doctorMandateService.findCoveringMandate({
      midwifeDoctorId: params.doctorId,
      icd9cmCode: params.procedureCode,
      onDate: new Date(`${params.startedOn}T00:00:00.000Z`),
    });
    return mandate?.id ?? null;
  }
}
