import { NotificationShell } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NotificationRepository } from '../repository/notification.repository';

const ADMIN_PORTAL_PERMISSION = 'portal.admin-access:any';
const DOCTOR_PORTAL_PERMISSION = 'portal.doctor-access:any';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const DOCTOR_ROLES = ['DOCTOR'];
const ADMIN_VAULT_HREF = '/admin/vault';
const DOCTOR_VAULT_HREF = '/doctor/vault';
const ADMIN_LAB_ORDER_PATH_PREFIX = '/admin/laboratory/';
const DOCTOR_ENCOUNTER_PATH_PREFIX = '/doctor/encounters/';

/**
 * Resolves the shell-relative `href` stored on a notification row (IMP-21).
 *
 * A notification's target is decided by **who receives it**, not by the record
 * being announced. `apps/web/proxy.ts` gates `/admin/*` and `/doctor/*`, and a
 * path belonging to a shell the recipient does not hold is not a 404 — it
 * falls through to `redirectToHome()`, so the bell row silently lands on the
 * recipient's own dashboard. That is the whole bug this service exists to
 * prevent: a producer that hardcodes a prefix cannot know which shell the
 * reader is in, because a vault owner may be an admin or a doctor and a lab
 * order raised for a walk-in is announced to the admin desk.
 *
 * The precedence mirrors `proxy.ts` exactly: admin wins when an account holds
 * both, because the admin shell is a superset and bouncing such a user to
 * `/doctor` would hide surfaces they are entitled to. Roles are read as a
 * fallback beside the portal permissions for the same reason the proxy does
 * it — accounts predating the portal grants, and `LAB_TECHNICIAN`, which
 * holds `portal.admin-access:any` and belongs in the admin shell.
 */
@Injectable()
export class NotificationHrefService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  /**
   * The shell a recipient lands in, or `null` when the account cannot be
   * resolved at all. Callers treat `null` as "assume admin": every producer
   * writes notifications best-effort inside its own try/catch, so a lookup
   * that comes back empty must still yield a usable row rather than throw.
   */
  async resolveShellForUser(userId: string): Promise<NotificationShell | null> {
    const claims = await this.notificationRepository.findShellClaimsByUserId(userId);
    if (!claims) {
      return null;
    }
    const hasAdminShell =
      claims.permissionKeys.includes(ADMIN_PORTAL_PERMISSION) ||
      claims.roleCodes.some((code) => ADMIN_ROLES.includes(code));
    if (hasAdminShell) {
      return 'admin';
    }
    const hasDoctorShell =
      claims.permissionKeys.includes(DOCTOR_PORTAL_PERMISSION) ||
      claims.roleCodes.some((code) => DOCTOR_ROLES.includes(code));
    return hasDoctorShell ? 'doctor' : null;
  }

  /**
   * The recipient's own vault page. There is no shell-less `/vault` route —
   * only `/admin/vault` and `/doctor/vault` — so this must be resolved per
   * recipient; "shared with me" is a panel inside that page, not a route of
   * its own.
   */
  async buildVaultHref(userId: string): Promise<string> {
    const shell = await this.resolveShellForUser(userId);
    return shell === 'doctor' ? DOCTOR_VAULT_HREF : ADMIN_VAULT_HREF;
  }

  /**
   * Where a lab result belongs for this reader: the encounter it was ordered
   * on when the recipient is a doctor who can open that shell, and the admin
   * order page otherwise. An order with no encounter has no doctor-side page
   * to deep-link into at all.
   */
  async buildLabOrderHrefForUser(params: {
    userId: string;
    orderId: string;
    encounterId: string | null;
  }): Promise<string> {
    if (params.encounterId === null) {
      return `${ADMIN_LAB_ORDER_PATH_PREFIX}${params.orderId}`;
    }
    const shell = await this.resolveShellForUser(params.userId);
    return shell === 'doctor'
      ? `${DOCTOR_ENCOUNTER_PATH_PREFIX}${params.encounterId}`
      : `${ADMIN_LAB_ORDER_PATH_PREFIX}${params.orderId}`;
  }

  /**
   * The admin-shell target for a lab order, used when a row is broadcast to a
   * permission rather than addressed to one account — `lab-order.write:any`
   * is seeded to ADMIN, so there is no doctor shell to land in.
   */
  buildAdminLabOrderHref(orderId: string): string {
    return `${ADMIN_LAB_ORDER_PATH_PREFIX}${orderId}`;
  }
}
