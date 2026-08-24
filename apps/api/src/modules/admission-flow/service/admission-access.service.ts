import { Actor, ActorScopeResolution, AdmissionRecord } from '@hms/shared-types';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { AdmissionFlowRepository } from '../repository/admission-flow.repository';

const ADMISSION_SUBJECT = 'Admission';

/**
 * The permission gate shared by every admission route.
 *
 * It lives apart from the service that moves patients between beds because
 * reading a stay and running one answer to different rules — a covering doctor
 * reads the ward round they are walking, while admitting and discharging are
 * their own granted verbs — and those rules are worth stating once rather than
 * at every call site.
 */
@Injectable()
export class AdmissionAccessService {
  constructor(
    private readonly admissionFlowRepository: AdmissionFlowRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditContextService: AuditContextService,
  ) {}

  async resolveReadScopeOrThrow(currentUser: CurrentUser): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, 'read');

    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read admissions');
    }

    return scope;
  }

  /**
   * Readers under OWN scope are the patient the stay is about, the doctor who
   * admitted them, and any doctor the patient is currently assigned to —
   * reading the ward round is part of walking it.
   */
  async assertCanReadAdmission(params: {
    admission: AdmissionRecord;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): Promise<void> {
    const { admission, scope, currentUser } = params;
    // The admission is the only thing in the exchange that names the patient,
    // so stamping it here is what puts a bed-history read into the patient's
    // access history (SJ-4).
    this.auditContextService.setPatientId(admission.patientId);

    if (scope.hasAny) {
      return;
    }

    if (
      admission.patientOwnerUserId === currentUser.sub ||
      admission.admittingDoctorOwnerUserId === currentUser.sub
    ) {
      return;
    }

    const assignment = await this.findAssignmentForCaller(admission.patientId, currentUser);

    if (!assignment) {
      throw new ForbiddenException('You are not allowed to read this admission');
    }
  }

  /**
   * Writing a lifecycle transition needs its own verb, and holding it is the
   * whole check: `admission.admit` and friends are granted `:any` only, because
   * a ward clerk transferring a patient they have never met is the normal case,
   * not an escalation.
   */
  async assertCanRunLifecycleOrThrow(currentUser: CurrentUser, action: string): Promise<void> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, action);

    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException(`You are not allowed to ${action} patients`);
    }
  }

  private async findAssignmentForCaller(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<{ id: string } | null> {
    const doctor = await this.admissionFlowRepository.findActiveDoctorByOwnerUserId(
      currentUser.sub,
    );

    if (!doctor) {
      return null;
    }

    return this.admissionFlowRepository.findActiveDoctorPatientAssignment(doctor.id, patientId);
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);

    if (!actor) {
      throw new UnauthorizedException('User not found');
    }

    return actor;
  }

  private resolveScope(actor: Actor, action: string): ActorScopeResolution {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );
    const matches = permissions.filter(
      (permission) => permission.resource === ADMISSION_SUBJECT && permission.action === action,
    );

    return {
      hasAny: matches.some((permission) => permission.scope === 'ANY'),
      hasOwn: matches.some((permission) => permission.scope === 'OWN'),
    };
  }
}
