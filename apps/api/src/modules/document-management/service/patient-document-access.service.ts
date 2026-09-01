import {
  Actor,
  ActorScopeResolution,
  PatientDocumentAction,
  PatientDocumentReadAccess,
} from '@hms/shared-types';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DocumentRepository } from '../repository/document.repository';

const PATIENT_DOCUMENT_SUBJECT = 'PatientDocument';

/**
 * The permission gate shared by every patient-document route (`P16-T08`).
 *
 * The global guard proves the actor may act on *some* `PatientDocument`; it
 * cannot tell `ANY` from `OWN`, so scope is re-resolved here. `OWN` answers
 * differently per verb, deliberately (§7.2.4):
 *
 *   * **read** — the patient themselves (released files only), or a doctor
 *     with an active assignment *or* an attended encounter for the patient —
 *     the same definition `encounter.read:own` uses (FR-E2-06).
 *   * **write / release** — a doctor with an active assignment only. Reading
 *     a past visit is clinical necessity; writing into someone's permanent
 *     record is not, and there is no break-glass path.
 *
 * Refusals are 403s that reveal nothing about whether a document exists; the
 * routes themselves answer 404 for ids outside the queried set.
 */
@Injectable()
export class PatientDocumentAccessService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditContextService: AuditContextService,
  ) {}

  async resolveScopeOrThrow(
    currentUser: CurrentUser,
    action: PatientDocumentAction,
  ): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, action);
    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException(`You are not allowed to ${action} patient documents`);
    }
    return scope;
  }

  /**
   * Admits a read of one patient's documents and answers how much of the
   * file the caller may see. Stamping the patient here is what puts every
   * clinical-document read into the patient's access history (SJ-4) — these
   * routes are the only party in the exchange that knows the patient.
   */
  async assertCanReadPatientDocuments(params: {
    patientId: string;
    patientOwnerUserId: string | null;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): Promise<PatientDocumentReadAccess> {
    const { patientId, patientOwnerUserId, scope, currentUser } = params;
    this.auditContextService.setPatientId(patientId);
    if (scope.hasAny) {
      return 'FULL';
    }
    if (patientOwnerUserId !== null && patientOwnerUserId === currentUser.sub) {
      return 'RELEASED_ONLY';
    }
    const doctor = await this.documentRepository.findActiveDoctorByOwnerUserId(currentUser.sub);
    if (doctor !== null) {
      const assignment = await this.documentRepository.findActiveDoctorPatientAssignment(
        doctor.id,
        patientId,
      );
      if (assignment !== null) {
        return 'FULL';
      }
      const hasAttended = await this.documentRepository.hasDoctorAttendedPatientEncounter(
        doctor.id,
        patientId,
      );
      if (hasAttended) {
        return 'FULL';
      }
    }
    throw new ForbiddenException('You are not allowed to read this patient’s documents');
  }

  /**
   * Admits a write (upload, edit, release) against one patient's file. `OWN`
   * is an active assignment only — narrower than the read gate on purpose.
   */
  async assertCanWritePatientDocuments(params: {
    patientId: string;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
    action: PatientDocumentAction;
  }): Promise<void> {
    const { patientId, scope, currentUser, action } = params;
    this.auditContextService.setPatientId(patientId);
    if (scope.hasAny) {
      return;
    }
    const doctor = await this.documentRepository.findActiveDoctorByOwnerUserId(currentUser.sub);
    if (doctor !== null) {
      const assignment = await this.documentRepository.findActiveDoctorPatientAssignment(
        doctor.id,
        patientId,
      );
      if (assignment !== null) {
        return;
      }
    }
    throw new ForbiddenException(`You are not allowed to ${action} this patient’s documents`);
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);
    if (!actor) {
      throw new UnauthorizedException('User not found');
    }
    return actor;
  }

  private resolveScope(actor: Actor, action: PatientDocumentAction): ActorScopeResolution {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );
    const matches = permissions.filter(
      (permission) =>
        permission.resource === PATIENT_DOCUMENT_SUBJECT && permission.action === action,
    );
    return {
      hasAny: matches.some((permission) => permission.scope === 'ANY'),
      hasOwn: matches.some((permission) => permission.scope === 'OWN'),
    };
  }
}
