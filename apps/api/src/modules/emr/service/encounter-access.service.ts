import {
  Actor,
  ActorScopeResolution,
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

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { EncounterRepository } from '../repository/encounter.repository';

const ENCOUNTER_SUBJECT = 'Encounter';

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
  ) {}

  async resolveScopeOrThrow(
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, action);

    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException(`You are not allowed to ${action} clinical encounters`);
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

    if (scope.hasAny) {
      return;
    }

    if (
      encounter.patient.ownerUserId === currentUser.sub ||
      encounter.doctor.ownerUserId === currentUser.sub
    ) {
      return;
    }

    const assignment = await this.findAssignmentForCaller(encounter.patientId, currentUser);

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

  private async findAssignmentForCaller(
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
