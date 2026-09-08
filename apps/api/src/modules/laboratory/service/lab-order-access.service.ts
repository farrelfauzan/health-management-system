import { Actor, ActorScopeResolution, LabOrderEncounterRecord } from '@hms/shared-types';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditContextService } from '../../../common/audit/audit-context.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';

const LAB_ORDER_SUBJECT = 'LabOrder';

/**
 * Who may order, read and cancel laboratory work.
 *
 * `EncounterAccessService` applied to the bench, and deliberately a second
 * gate rather than a call into that one: an analis holds `lab-order.read:any`
 * and no encounter key at all, so routing this through the encounter's gate
 * would refuse the person the worklist exists for. The rules it enforces for
 * OWN scope are the encounter's own — a doctor orders on the visits they are
 * attending — because that is what "own" means for an order that hangs off an
 * encounter.
 */
@Injectable()
export class LabOrderAccessService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly auditContextService: AuditContextService,
  ) {}

  async resolveScopeOrThrow(
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<ActorScopeResolution> {
    const actor = await this.getActorOrThrow(currentUser);
    const scope = this.resolveScope(actor, action);

    if (!scope.hasAny && !scope.hasOwn) {
      throw new ForbiddenException(`You are not allowed to ${action} laboratory orders`);
    }

    return scope;
  }

  /**
   * The front desk's scope, for a request that belongs to no encounter
   * (P18-T10). `:own` cannot answer here — it resolves through the attending
   * practitioner, and a walk-in has none — so the clinic-wide grant is the only
   * one that means anything, and a patient holding `:own` must not be able to
   * raise a request in a doctor's name.
   */
  async resolveAnyScopeOrThrow(
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<ActorScopeResolution> {
    const scope = await this.resolveScopeOrThrow(currentUser, action);
    if (!scope.hasAny) {
      throw new ForbiddenException(
        `You are not allowed to ${action} laboratory orders outside an encounter`,
      );
    }
    return scope;
  }

  /**
   * Ordering is the attending practitioner's act. A covering doctor who wants
   * a test opens their own encounter, exactly as they would to write a note.
   */
  assertCanOrderOnEncounter(params: {
    encounter: LabOrderEncounterRecord;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): void {
    const { encounter, scope, currentUser } = params;
    this.auditContextService.setPatientId(encounter.patientId);

    if (scope.hasAny) {
      return;
    }

    if (encounter.doctorOwnerUserId !== currentUser.sub) {
      throw new ForbiddenException(
        'Only the attending practitioner may order laboratory tests on this encounter',
      );
    }
  }

  /**
   * Reading is wider than ordering: the patient the work is about reads it too,
   * which is what makes an order visible in the portal without a second key.
   */
  assertCanReadEncounterOrders(params: {
    encounter: LabOrderEncounterRecord;
    scope: ActorScopeResolution;
    currentUser: CurrentUser;
  }): void {
    const { encounter, scope, currentUser } = params;
    this.auditContextService.setPatientId(encounter.patientId);

    if (scope.hasAny) {
      return;
    }

    if (
      encounter.doctorOwnerUserId === currentUser.sub ||
      encounter.patientOwnerUserId === currentUser.sub
    ) {
      return;
    }

    throw new ForbiddenException('You are not allowed to read this encounter’s laboratory orders');
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
      (permission) => permission.resource === LAB_ORDER_SUBJECT && permission.action === action,
    );

    return {
      hasAny: matches.some((permission) => permission.scope === 'ANY'),
      hasOwn: matches.some((permission) => permission.scope === 'OWN'),
    };
  }
}
