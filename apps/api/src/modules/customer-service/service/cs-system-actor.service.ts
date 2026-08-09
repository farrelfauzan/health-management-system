import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';

/**
 * The reserved account a chat-originated write is attributed to (`PCS-T07`).
 *
 * The same problem the BPJS bridge solved at `P14-T04`, and the same answer
 * for the same reason: every `Appointment` and every `PatientProfile` carries
 * an actor, an inbound WhatsApp message has no human behind it, and the domain
 * services this module must call — §4.2 says services, never repositories —
 * resolve permissions from a real user row. A null actor would have meant a
 * permission-check bypass on the one code path reachable from the public
 * internet without any authentication at all.
 *
 * What the account can do is therefore written down in the RBAC tables like
 * everybody else's, and it is the shortest list in the system: create and read
 * patients, read and create appointments, read sessions. It cannot unmask an
 * identifier, cannot touch a registration, cannot cancel, and cannot log in —
 * the auth service refuses `isSystem` accounts before it compares a password.
 *
 * **`patient.read:any` is the grant to look at twice.** The channel needs it
 * for exactly one thing: deciding whether a typed phone number matches a
 * record, so §5.1.1 knows whether to challenge. No tool returns a patient, and
 * `findChannelPhoneMatches` projects to ids and names that never leave the
 * process — but the grant is real, so the mitigation is that the tool
 * catalogue has nowhere to spend it.
 */
export const CUSTOMER_SERVICE_SYSTEM_ACTOR_EMAIL = 'customer-service-channel@system.hms.local';

@Injectable()
export class CsSystemActorService {
  private cachedActor: CurrentUser | null = null;

  constructor(private readonly authRepository: AuthRepository) {}

  /**
   * Resolves the reserved actor, or refuses the call. A missing account is a
   * deployment that has not been seeded, and the honest outcome is that the
   * booking cannot be made — proceeding without an actor would put an
   * unattributable row in the appointment book.
   */
  async resolveActor(): Promise<CurrentUser> {
    if (this.cachedActor !== null) {
      return this.cachedActor;
    }
    const user = await this.authRepository.findUserByEmail(CUSTOMER_SERVICE_SYSTEM_ACTOR_EMAIL);
    if (!user || !user.isSystem) {
      throw new ServiceUnavailableException(
        'The customer-service channel system account is not provisioned on this deployment',
      );
    }
    this.cachedActor = { sub: user.id, email: user.email };
    return this.cachedActor;
  }
}
