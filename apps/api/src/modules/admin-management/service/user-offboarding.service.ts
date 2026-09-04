import {
  OFFBOARDING_REMINDER_THRESHOLD_DAYS,
  OffboardedUserRecord,
  OffboardingEmailKind,
  OffboardingVaultSummary,
  resolveOffboardingDaysRemaining,
  resolveOffboardingDeadline,
  UserOffboardingConfig,
  UserOffboardingPreview,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { MailService } from '../../../common/mail/mail.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuditAction } from '../../../generated/prisma/client';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { VaultOffboardingService } from '../../document-management/service/vault-offboarding.service';
import { AdminManagementRepository } from '../repository/admin-management.repository';
import { resolveUserOffboardingConfig } from '../user-offboarding.config';
import { renderOffboardingEmail } from './render-offboarding-email';

/** The notice threshold that marks the window closing and the purge done. */
const WINDOW_CLOSED_THRESHOLD_DAYS = 0;
const DOCTOR_VAULT_PATH = '/doctor/vault';
const ADMIN_VAULT_PATH = '/admin/vault';
const USER_AUDIT_RESOURCE = 'user';

/** The row the action decides on, as the repository returns it. */
type OffboardingCandidate = {
  id: string;
  email: string;
  isActive: boolean;
  isSystem: boolean;
  offboardedAt: Date | null;
  roles: Array<{ role: { code: string } }>;
};

/**
 * Offboarding (`P16-T41`, §7.3.10): the super-admin action, its preview and
 * reversal, and the sweep that keeps the promise afterwards.
 *
 * **It is not deactivation, and the two must stay separate.** Deactivate is
 * an immediate lockout for an incident or a dismissal for cause. Offboard is
 * a graceful exit: the person keeps signing in for thirty days with exactly
 * one capability — view, download, export and delete their own vault — and
 * is warned by email, on day zero and with seven days left, what will be
 * deleted, what will survive, and how to act. Collapsing the two would hand
 * every dismissed person a month of access, which is why a deactivated
 * account is refused here rather than quietly offboarded.
 *
 * Three mechanisms enforce the reduced state (§7.3.10.3), none of them in
 * this file: the ability factory branches on `User.offboardedAt`, the login
 * path refuses a closed window, and every session is revoked the moment the
 * action runs — that last one is here, because the reduced set must take
 * effect on the person's next request, not their next token refresh.
 */
@Injectable()
export class UserOffboardingService {
  private readonly logger = new Logger(UserOffboardingService.name);
  private readonly config: UserOffboardingConfig;

  constructor(
    private readonly adminManagementRepository: AdminManagementRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly vaultOffboardingService: VaultOffboardingService,
    configService: ConfigService,
  ) {
    this.config = resolveUserOffboardingConfig(configService);
  }

  /** What the super admin confirms against (FR-E3-31). */
  async previewOffboarding(userId: string): Promise<UserOffboardingPreview> {
    const user = await this.requireCandidate(userId);
    return this.buildPreview(user, new Date());
  }

  /**
   * Opens the window: stamps `offboardedAt`, revokes every session, audits
   * both, and sends the day-zero email. The email is sent last and never
   * fails the request — the state change is the promise, and an SMTP
   * timeout must not leave a super admin with a success-shaped failure and a
   * person who is half offboarded.
   */
  async offboardUser(
    userId: string,
    actor: CurrentUser,
    origin: RequestContext,
  ): Promise<UserOffboardingPreview> {
    const user = await this.requireCandidate(userId);
    if (user.id === actor.sub) {
      throw new BadRequestException('You cannot offboard your own account');
    }
    if (user.offboardedAt !== null) {
      throw new ConflictException('This user is already being offboarded');
    }
    if (!user.isActive) {
      // §7.3.10.2: a deactivated person never gets the window. Offboarding
      // them would turn a lockout back into a month of access.
      throw new ConflictException(
        'A deactivated user cannot be offboarded; deactivation already locks them out',
      );
    }
    const now = new Date();
    const summary = await this.vaultOffboardingService.summariseVault(user.id, now);
    await this.adminManagementRepository.markOffboarded(user.id, now);
    const revokedCount = await this.authRepository.revokeAllUserRefreshTokens(user.id);
    await this.auditService.record({
      action: AuditAction.SESSION_REVOKED_ALL,
      resource: 'auth',
      actorUserId: actor.sub,
      resourceId: user.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { revokedCount, reason: 'USER_OFFBOARDED' },
    });
    const offboarded: OffboardingCandidate = { ...user, offboardedAt: now };
    const preview = await this.buildPreview(offboarded, now, summary);
    await this.auditService.record({
      action: AuditAction.USER_OFFBOARDED,
      resource: USER_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: user.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: {
        sharedDocumentCount: summary.sharedDocumentCount,
        unsharedDocumentCount: summary.unsharedDocumentCount,
        deletionDate: preview.deletionDate,
      },
    });
    await this.deliverEmail(this.toSweepRecord(offboarded, now), 'DAY_ZERO', summary);
    return preview;
  }

  /**
   * Cancels the window (FR-E3-30): clears the stamp and every notice, so
   * nothing is deleted and normal access resolves on the next request. What
   * the purge already removed, if the window had closed, is gone.
   */
  async reonboardUser(
    userId: string,
    actor: CurrentUser,
    origin: RequestContext,
  ): Promise<UserOffboardingPreview> {
    const user = await this.requireCandidate(userId);
    if (user.offboardedAt === null) {
      throw new ConflictException('This user is not being offboarded');
    }
    await this.adminManagementRepository.clearOffboarded(user.id);
    await this.auditService.record({
      action: AuditAction.USER_REONBOARDED,
      resource: USER_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: user.id,
      ipAddress: origin.ipAddress,
      requestId: origin.requestId,
      metadata: { offboardedAt: user.offboardedAt.toISOString() },
    });
    return this.buildPreview({ ...user, offboardedAt: null }, new Date());
  }

  /**
   * One pass over everyone in a window. Returns how many people it acted on.
   *
   * Two thresholds, claimed through the notice table so a re-run is a no-op:
   * seven days left sends the reminder; the window closing runs the purge,
   * once. Everything else — the refusal to sign in — is decided from the date
   * on the login path and does not wait for this.
   */
  async sweepOnce(now: Date): Promise<number> {
    const users = await this.adminManagementRepository.listOffboardedUsers();
    let handledCount = 0;
    for (const user of users) {
      if (await this.sweepUser(user, now)) {
        handledCount += 1;
      }
    }
    return handledCount;
  }

  private async sweepUser(user: OffboardedUserRecord, now: Date): Promise<boolean> {
    const daysRemaining = resolveOffboardingDaysRemaining(
      user.offboardedAt,
      now,
      this.config.clinicTimeZone,
    );
    if (daysRemaining <= 0) {
      return this.closeWindow(user, now);
    }
    if (daysRemaining > OFFBOARDING_REMINDER_THRESHOLD_DAYS) {
      return false;
    }
    const claimed = await this.adminManagementRepository.claimOffboardingNotice(
      user.id,
      OFFBOARDING_REMINDER_THRESHOLD_DAYS,
    );
    if (!claimed) {
      return false;
    }
    const summary = await this.vaultOffboardingService.summariseVault(user.id, now);
    await this.deliverEmail(user, 'SEVEN_DAYS_LEFT', summary);
    return true;
  }

  private async closeWindow(user: OffboardedUserRecord, now: Date): Promise<boolean> {
    const claimed = await this.adminManagementRepository.claimOffboardingNotice(
      user.id,
      WINDOW_CLOSED_THRESHOLD_DAYS,
    );
    if (!claimed) {
      return false;
    }
    await this.vaultOffboardingService.purgeUnsharedDocuments(user.id, now);
    return true;
  }

  private async deliverEmail(
    user: OffboardedUserRecord,
    kind: OffboardingEmailKind,
    summary: OffboardingVaultSummary,
  ): Promise<void> {
    const mail = renderOffboardingEmail({
      kind,
      deadline: resolveOffboardingDeadline(user.offboardedAt, this.config.clinicTimeZone),
      summary,
      vaultUrl: this.resolveVaultUrl(user.roleCodes),
    });
    try {
      const result = await this.mailService.sendMail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (!result.accepted) {
        this.logger.warn(buildSafeErrorLog('offboarding_mail_not_accepted', { kind }));
      }
    } catch {
      // Without the address: a bounce log is a list of people the clinic let go.
      this.logger.warn(buildSafeErrorLog('offboarding_mail_failed', { kind }));
    }
  }

  /**
   * The person's own vault page, in the shell they can still enter. A doctor
   * who also holds an admin role goes to the doctor shell, matching the
   * precedence `VaultDocumentAccessService` resolves their vault by.
   */
  private resolveVaultUrl(roleCodes: readonly string[]): string {
    const path = roleCodes.includes('DOCTOR') ? DOCTOR_VAULT_PATH : ADMIN_VAULT_PATH;
    return `${this.config.webAppBaseUrl}${path}`;
  }

  private async buildPreview(
    user: OffboardingCandidate,
    now: Date,
    summary?: OffboardingVaultSummary,
  ): Promise<UserOffboardingPreview> {
    const resolvedSummary =
      summary ?? (await this.vaultOffboardingService.summariseVault(user.id, now));
    const deadline = resolveOffboardingDeadline(
      user.offboardedAt ?? now,
      this.config.clinicTimeZone,
    );
    return {
      userId: user.id,
      email: user.email,
      sharedDocumentCount: resolvedSummary.sharedDocumentCount,
      unsharedDocumentCount: resolvedSummary.unsharedDocumentCount,
      deletionDate: deadline.toISOString().slice(0, 10),
      offboardedAt: user.offboardedAt?.toISOString() ?? null,
    };
  }

  private toSweepRecord(user: OffboardingCandidate, offboardedAt: Date): OffboardedUserRecord {
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      offboardedAt,
      roleCodes: user.roles.map((userRole) => userRole.role.code),
    };
  }

  /**
   * A service account answers 404 like a missing row: it is an actor for
   * machine writes, not a person with a vault, and the shape of a refusal
   * must not say which reserved rows exist.
   */
  private async requireCandidate(userId: string): Promise<OffboardingCandidate> {
    const user = await this.adminManagementRepository.findUserForOffboarding(userId);
    if (!user || user.isSystem) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
