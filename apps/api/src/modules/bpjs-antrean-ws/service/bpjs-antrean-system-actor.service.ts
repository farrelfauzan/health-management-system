import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';

/**
 * The reserved account a BPJS-originated write is attributed to (P14-T04).
 *
 * §3.4 of the evaluation named the gap this closes: every `Registration`,
 * `Appointment` and audit row carries an actor `User`, and an inbound BPJS
 * call has no human behind it. The two ways out were a nullable actor plus a
 * provenance column, or a reserved service user. This is the second, chosen
 * because the domain services HMS must call — and §4.2 says it must call
 * services, never repositories — resolve permissions from a real user row.
 * A null actor would have meant a permission-check bypass on the one code
 * path where a bypass is least acceptable.
 *
 * What the account can do is therefore visible in the RBAC tables like
 * everybody else's, and deliberately narrow: patient read/create, appointment
 * read/create/cancel, session read. It cannot unmask an identifier, cannot
 * touch a registration, and cannot log in — the auth service refuses
 * `isSystem` accounts before comparing a password.
 */
export const BPJS_ANTREAN_SYSTEM_ACTOR_EMAIL = 'bpjs-antrean-bridge@system.hms.local';

@Injectable()
export class BpjsAntreanSystemActorService {
  private cachedActor: CurrentUser | null = null;

  constructor(private readonly authRepository: AuthRepository) {}

  /**
   * Resolves the reserved actor, or refuses the call. A missing account is a
   * deployment that has not been seeded, and the honest answer is that the
   * facility cannot serve the request — inventing an actor, or proceeding
   * without one, would put an unattributable row in a medical record.
   */
  async resolveActor(): Promise<CurrentUser> {
    if (this.cachedActor !== null) {
      return this.cachedActor;
    }
    const user = await this.authRepository.findUserByEmail(BPJS_ANTREAN_SYSTEM_ACTOR_EMAIL);
    if (!user || !user.isSystem) {
      throw new ServiceUnavailableException(
        'The BPJS Antrean system account is not provisioned on this deployment',
      );
    }
    this.cachedActor = { sub: user.id, email: user.email };
    return this.cachedActor;
  }
}
