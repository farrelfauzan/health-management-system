import {
  Actor,
  ActorScopeResolution,
  EncounterReadAccess,
  EncounterWithRelationsRecord,
  canTransitionEncounterStatus,
  EncounterStatusValue,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { EncounterRepository } from '../repository/encounter.repository';

const ENCOUNTER_SUBJECT = 'Encounter';
const RECORD_VITALS_ACTION = 'record-vitals';
const READ_SUMMARY_ACTION = 'read-summary';

/**
 * The permission and lifecycle gate shared by every encounter route.
 *
 * It lives apart from the services that write records because reading a
 * clinical record and writing one answer to different rules — a patient and a
 * covering doctor may read what only the attending practitioner may sign — and
 * those rules are worth stating once rather than at eleven call sites.
 */
@Injectable()
export class EncounterAccessService {
  constructor(
    private readonly encounterRepository: EncounterRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditContextService: AuditContextService,
  ) {}

  /**
   * One encounter with the relations this gate reads, for a module that hangs
   * off an encounter without owning it (P25-T06). It lives here rather than on
   * `EncounterService` deliberately: that service reaches back into the
   * maternal module to freeze a K-code at close, so importing it from there
   * would close a value-level require cycle that no `forwardRef` can open.
   * This service imports nothing that imports it.
   */
  async findEncounterForAccess(id: string): Promise<EncounterWithRelationsRecord | null> {
    return this.encounterRepository.findEncounterWithRelationsById(id);
  }

  async resolveScopeOrThrow(
    currentUser: CurrentUser,
    action: 'open' | 'read' | 'write',
  ): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, action);

    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException(`You are not allowed to ${action} clinical encounters`);
    }

    return scope;
  }

  /**
   * Who may read encounters, and how much of them (P22-T03, P22-T05). An
   * `encounter.read` grant reads the record as it always has. Failing that,
   * `encounter.record-vitals:any` reads as triage — every visit, its summary
   * and vital signs — and `encounter.read-summary:any` reads as billing and
   * the front desk: every visit, its summary, nothing of the record (D-033).
   */
  async resolveReadAccessOrThrow(currentUser: CurrentUser): Promise<EncounterReadAccess> {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'read');
    if (readScope.hasAny || readScope.hasOwn) {
      return { scope: readScope, view: 'FULL' };
    }
    const everyVisit = { hasAny: true, hasOwn: false };
    if (this.resolveScope(actor, RECORD_VITALS_ACTION).hasAny) {
      return { scope: everyVisit, view: 'VITALS' };
    }
    if (this.resolveScope(actor, READ_SUMMARY_ACTION).hasAny) {
      return { scope: everyVisit, view: 'SUMMARY' };
    }
    throw new ForbiddenException('You are not allowed to read clinical encounters');
  }

  /**
   * The scope for recording vital signs (P22-T03): whoever may write the
   * encounter — the attending clinician under OWN — widened by
   * `encounter.record-vitals`, which lets triage measure a patient on a visit
   * they will never sign.
   */
  async resolveVitalsScopeOrThrow(currentUser: CurrentUser): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const writeScope = this.resolveScope(actor, 'write');
    const vitalsScope = this.resolveScope(actor, RECORD_VITALS_ACTION);
    const scope = {
      hasAny: writeScope.hasAny || vitalsScope.hasAny,
      hasOwn: writeScope.hasOwn || vitalsScope.hasOwn,
    };
    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException('You are not allowed to record vital signs');
    }
    return scope;
  }

  /**
   * Readers under OWN scope are the patient the record is about, the doctor who
   * attended it, and any doctor the patient is currently assigned to — reading
   * the previous visit is part of conducting the next one.
   */
  async assertCanReadEncounter(params: {
    encounter: EncounterWithRelationsRecord;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): Promise<void> {
    const { encounter, scope, currentUser } = params;
    // Every encounter read and write passes through this gate, and the
    // encounter is the only thing in the exchange that names the patient — a
    // diagnosis route returns a diagnosis. Stamping it here is what puts
    // clinical sub-resources into the patient's access history (SJ-4).
    this.auditContextService.setPatientId(encounter.patientId);

    if (scope.hasAny) {
      return;
    }

    if (
      encounter.patient.ownerUserId === currentUser.sub ||
      encounter.doctor.ownerUserId === currentUser.sub
    ) {
      return;
    }

    const assignment = await this.findActiveAssignmentForCaller(encounter.patientId, currentUser);

    if (!assignment) {
      throw new ForbiddenException('You are not allowed to read this encounter');
    }
  }

  /**
   * Writing is narrower than reading: only the attending practitioner signs the
   * record. A covering doctor who needs to add to it opens their own encounter
   * rather than editing someone else's signature.
   */
  assertCanWriteEncounter(params: {
    encounter: EncounterWithRelationsRecord;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): void {
    const { encounter, scope, currentUser } = params;
    this.auditContextService.setPatientId(encounter.patientId);

    if (scope.hasAny) {
      return;
    }

    if (encounter.doctor.ownerUserId !== currentUser.sub) {
      throw new ForbiddenException('Only the attending practitioner may write this encounter');
    }
  }

  /** A closed record is corrected by superseding it, never by writing to it again. */
  assertEncounterOpen(encounter: EncounterWithRelationsRecord): void {
    if (encounter.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Encounter in status ${encounter.status} can no longer be modified`,
      );
    }
  }

  assertAllowedStatusTransition(
    fromStatus: EncounterStatusValue,
    toStatus: EncounterStatusValue,
  ): void {
    if (!canTransitionEncounterStatus(fromStatus, toStatus)) {
      throw new ConflictException(
        `Encounter status can not change from ${fromStatus} to ${toStatus}`,
      );
    }
  }

  /**
   * The caller's active assignment to this patient, or null. Public because
   * a record that rolls several encounters up — a pregnancy episode
   * (P25-T06) — has to answer the same "may I see this patient's clinical
   * record" question without having one encounter to ask it about.
   */
  async findActiveAssignmentForCaller(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<{ id: string } | null> {
    const doctor = await this.encounterRepository.findActiveDoctorByOwnerUserId(currentUser.sub);

    if (!doctor) {
      return null;
    }

    return this.encounterRepository.findActiveDoctorPatientAssignment(doctor.id, patientId);
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
      (permission) => permission.resource === ENCOUNTER_SUBJECT && permission.action === action,
    );

    return {
      hasAny: matches.some((permission) => permission.scope === 'ANY'),
      hasOwn: matches.some((permission) => permission.scope === 'OWN'),
    };
  }
}
