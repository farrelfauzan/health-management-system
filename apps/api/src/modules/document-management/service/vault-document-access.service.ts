import { VaultDocumentOwnerTypeValue } from '@hms/shared-types';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';

/** The three things a person can be granted over their own vault. */
export type VaultDocumentAction = 'read' | 'write' | 'share';

/**
 * Which vault the actor owns, and whether they may act on it at `OWN` scope
 * (`P16-T17`, extended for sharing by `P16-T34`).
 *
 * Extracted from `VaultDocumentService` when the sharing engine landed, so
 * the owner-scoped routes and the share routes resolve ownership by one rule
 * rather than two copies of it. A second copy is how a surface acquires a
 * subtly different answer to "whose vault is this", and here that answer is
 * the whole security boundary.
 *
 * The global guard proves the actor may act on *some* `VaultDocument`; it
 * cannot distinguish scope, because a CASL rule carrying an ownership
 * condition still answers "can share VaultDocument" for the subject type.
 * Checking the seeded `OWN` grant here is what stops a role holding neither
 * from opening a vault through these routes — and since no `ANY` key exists
 * for this surface at all, `OWN` is the only grant there is to hold.
 */
@Injectable()
export class VaultDocumentAccessService {
  constructor(private readonly authRepository: AuthRepository) {}

  /**
   * An administrator gets a vault of their own on the same terms as a doctor:
   * an admin is also a person with a contract and a KTP. It grants them
   * nothing over anyone else's.
   */
  async resolveVaultOwnerType(
    actor: CurrentUser,
    action: VaultDocumentAction,
  ): Promise<VaultDocumentOwnerTypeValue> {
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    const hasOwnScope = actorRecord.roles
      .flatMap((userRole) => userRole.role.permissions)
      .some(
        (rolePermission) =>
          rolePermission.permission.resource === 'VaultDocument' &&
          rolePermission.permission.action === action &&
          rolePermission.permission.scope === 'OWN',
      );
    if (!hasOwnScope) {
      throw new ForbiddenException('You are not allowed to manage a personal document vault');
    }
    // `code`, not `name`: the code is the unique, stable identifier roles are
    // seeded and matched by, while `name` is a display string an admin may
    // edit. Keying ownership off a mutable label would let a rename silently
    // move which vault a user opens.
    const roleCodes = actorRecord.roles.map((userRole) => userRole.role.code);
    if (roleCodes.includes('DOCTOR')) {
      return 'DOCTOR';
    }
    if (roleCodes.includes('ADMIN') || roleCodes.includes('SUPER_ADMIN')) {
      return 'ADMIN';
    }
    throw new ForbiddenException('You are not allowed to manage a personal document vault');
  }
}
