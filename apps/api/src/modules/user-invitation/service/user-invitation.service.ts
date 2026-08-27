import {
  AcceptUserInvitationInput,
  CreateUserInvitationInput,
  ListUserInvitationsParams,
  UserInvitationAcceptedView,
  UserInvitationPreview,
  UserInvitationView,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { AuditService } from '../../../common/audit/audit.service';
import { BreachedPasswordCheckerService } from '../../../common/crypto/breached-password-checker.service';
import { PasswordHasherService } from '../../../common/crypto/password-hasher.service';
import { MailService } from '../../../common/mail/mail.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AuditAction } from '../../../generated/prisma/client';
import { AdminManagementRepository } from '../../admin-management/repository/admin-management.repository';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { UserInvitationRepository } from '../repository/user-invitation.repository';
import { resolveUserInvitationConfig } from '../user-invitation.config';
import { UserInvitationConfig } from '../user-invitation.types';
import { buildInvitationUrl } from './build-invitation-url';
import { renderInvitationEmail } from './render-invitation-email';
import { resolveInvitationStatus } from './resolve-invitation-status';

/** 256 bits, matching the refresh token — see {@link mintToken}. */
const INVITATION_TOKEN_BYTES = 32;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';
const PRIVILEGED_ROLE_CODES: ReadonlySet<string> = new Set([SUPER_ADMIN_ROLE_CODE]);

type InvitationRow = Awaited<ReturnType<UserInvitationRepository['findInvitationById']>>;
type PresentableInvitation = NonNullable<InvitationRow>;

@Injectable()
export class UserInvitationService {
  private readonly logger = new Logger(UserInvitationService.name);
  private readonly config: UserInvitationConfig;

  constructor(
    private readonly userInvitationRepository: UserInvitationRepository,
    private readonly adminManagementRepository: AdminManagementRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditService: AuditService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly breachedPasswordChecker: BreachedPasswordCheckerService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.config = resolveUserInvitationConfig(this.configService);
  }

  async createInvitation(
    payload: CreateUserInvitationInput,
    currentUserId: string,
  ): Promise<UserInvitationView> {
    await this.assertCanAssignRoleCodes(payload.roleCodes, currentUserId);
    await this.assertRoleCodesExist(payload.roleCodes);
    const now = new Date();
    const existingUser = await this.adminManagementRepository.findActiveUserByEmail(payload.email);
    if (existingUser) {
      throw new ConflictException('User email already exists');
    }
    const liveInvitation = await this.userInvitationRepository.findLiveInvitationByEmail(
      payload.email,
      now,
    );
    if (liveInvitation) {
      throw new ConflictException('An invitation for this email is already pending');
    }
    const token = this.mintToken();
    const invitation = await this.userInvitationRepository.createInvitation({
      email: payload.email,
      tokenHash: this.hashToken(token),
      roleCodes: payload.roleCodes,
      invitedById: currentUserId,
      expiresAt: this.resolveExpiry(now),
    });
    await this.auditService.record({
      action: AuditAction.USER_INVITED,
      resource: 'user_invitation',
      actorUserId: currentUserId,
      resourceId: invitation.id,
      metadata: { roleCodes: payload.roleCodes },
    });
    await this.deliverInvitation(invitation, token);
    return this.presentInvitation(invitation, await this.resolveRoleNames([invitation]), now);
  }

  async listInvitations(params: ListUserInvitationsParams) {
    const now = new Date();
    const result = await this.userInvitationRepository.listInvitations(params, now);
    const roleNameByCode = await this.resolveRoleNames(result.items);
    return {
      items: result.items.map((invitation) =>
        this.presentInvitation(invitation, roleNameByCode, now),
      ),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  /**
   * Rotates the link. The previous token dies the moment this returns, whether
   * or not the new email is delivered — a resend exists because the old link
   * is suspect or lost, and leaving it live would make the feature strictly
   * worse than doing nothing.
   */
  async resendInvitation(id: string, currentUserId: string): Promise<UserInvitationView> {
    const now = new Date();
    const invitation = await this.requireInvitation(id);
    const status = resolveInvitationStatus(invitation, now);
    if (status === 'ACCEPTED') {
      throw new ConflictException('This invitation has already been accepted');
    }
    const token = this.mintToken();
    const replacement = await this.userInvitationRepository.replaceInvitation(
      {
        invitationId: invitation.id,
        tokenHash: this.hashToken(token),
        expiresAt: this.resolveExpiry(now),
      },
      now,
    );
    await this.auditService.record({
      action: AuditAction.USER_INVITED,
      resource: 'user_invitation',
      actorUserId: currentUserId,
      resourceId: replacement.id,
      metadata: { replacedInvitationId: invitation.id, resend: 'true' },
    });
    await this.deliverInvitation(replacement, token);
    return this.presentInvitation(replacement, await this.resolveRoleNames([replacement]), now);
  }

  async revokeInvitation(id: string, currentUserId: string): Promise<UserInvitationView> {
    const now = new Date();
    const invitation = await this.requireInvitation(id);
    const status = resolveInvitationStatus(invitation, now);
    if (status === 'ACCEPTED') {
      throw new ConflictException('This invitation has already been accepted');
    }
    if (status === 'REVOKED') {
      return this.presentInvitation(invitation, await this.resolveRoleNames([invitation]), now);
    }
    const revoked = await this.userInvitationRepository.revokeInvitation(invitation.id, now);
    await this.auditService.record({
      action: AuditAction.USER_INVITE_REVOKED,
      resource: 'user_invitation',
      actorUserId: currentUserId,
      resourceId: revoked.id,
    });
    return this.presentInvitation(revoked, await this.resolveRoleNames([revoked]), now);
  }

  /**
   * What the public accept page may know before anyone has proved anything.
   *
   * Every unusable token — unknown, expired, revoked, already accepted — is
   * refused, and the four are told apart, deliberately. The usual argument for
   * one flat error is that distinguishing them leaks; here it leaks nothing,
   * because reaching this route at all already requires guessing 256 bits.
   * Someone holding a real link that stopped working needs to know whether to
   * log in, ask for a resend, or ask their administrator — and a single
   * "invalid link" tells them to do none of those.
   */
  async previewInvitation(token: string): Promise<UserInvitationPreview> {
    const invitation = await this.requireUsableInvitation(token);
    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    token: string,
    payload: AcceptUserInvitationInput,
  ): Promise<UserInvitationAcceptedView> {
    const invitation = await this.requireUsableInvitation(token);
    if (this.breachedPasswordChecker.isBreached(payload.password)) {
      throw new BadRequestException(
        'This password appears in known breach lists. Choose a different one.',
      );
    }
    const existingUser = await this.adminManagementRepository.findActiveUserByEmail(
      invitation.email,
    );
    if (existingUser) {
      throw new ConflictException('User email already exists');
    }
    const roles = await this.adminManagementRepository.findActiveRolesByCodes(invitation.roleCodes);
    if (roles.length !== invitation.roleCodes.length) {
      throw new BadRequestException('One or more role codes on this invitation no longer exist');
    }
    const passwordHash = await this.passwordHasher.hashPassword(payload.password);
    const user = await this.userInvitationRepository.acceptInvitation({
      invitationId: invitation.id,
      email: invitation.email,
      passwordHash,
      roleIds: roles.map((role) => role.id),
      assignedById: invitation.invitedById,
      consumedAt: new Date(),
    });
    await this.auditService.record({
      action: AuditAction.USER_INVITE_ACCEPTED,
      resource: 'user_invitation',
      actorUserId: user.id,
      resourceId: invitation.id,
      metadata: { roleCodes: invitation.roleCodes.join(',') },
    });
    await this.auditService.record({
      action: AuditAction.USER_CREATED,
      resource: 'user',
      actorUserId: user.id,
      resourceId: user.id,
      metadata: { via: 'invitation', roleCodes: invitation.roleCodes.join(',') },
    });
    return { email: user.email };
  }

  /**
   * Mints the invitation token: 256 bits from the CSPRNG, base64url so it
   * survives a URL and an email client's line wrapping unescaped. Only the
   * SHA-256 is stored — plain SHA-256 rather than a password hash for the same
   * reason as refresh tokens, that a uniformly random 256-bit input has no
   * dictionary for a slow hash to defend against.
   */
  private mintToken(): string {
    return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveExpiry(now: Date): Date {
    return new Date(now.getTime() + this.config.ttlHours * MILLISECONDS_PER_HOUR);
  }

  /**
   * Sends the email after the row is committed, and never lets a send failure
   * reach the caller.
   *
   * The invitation exists either way: an SMTP timeout that rolled back the
   * invite would leave the administrator with a success-shaped failure and no
   * row to resend from. The failure is logged without the recipient address —
   * a bounce log is a list of addresses the clinic tried to reach — and the
   * administrator sees the invitation sitting in the pending list with a
   * resend button, which is the recovery.
   */
  private async deliverInvitation(invitation: PresentableInvitation, token: string): Promise<void> {
    const mail = renderInvitationEmail({
      recipientEmail: invitation.email,
      invitationUrl: buildInvitationUrl(this.config.webAppBaseUrl, token),
      expiresAt: invitation.expiresAt,
      invitedByEmail: invitation.invitedBy?.email ?? null,
    });
    const result = await this.mailService.sendMail({
      to: invitation.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    if (!result.accepted) {
      this.logger.warn(
        buildSafeErrorLog('user_invitation_mail_not_accepted', { invitationId: invitation.id }),
      );
    }
  }

  private async requireInvitation(id: string): Promise<PresentableInvitation> {
    const invitation = await this.userInvitationRepository.findInvitationById(id);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    return invitation;
  }

  private async requireUsableInvitation(token: string): Promise<PresentableInvitation> {
    const invitation = await this.userInvitationRepository.findInvitationByTokenHash(
      this.hashToken(token),
    );
    if (!invitation) {
      throw new NotFoundException('This invitation link is not valid');
    }
    const status = resolveInvitationStatus(invitation);
    if (status === 'ACCEPTED') {
      throw new ConflictException('This invitation has already been used');
    }
    if (status === 'REVOKED') {
      throw new GoneException('This invitation was withdrawn');
    }
    if (status === 'EXPIRED') {
      throw new GoneException('This invitation has expired');
    }
    return invitation;
  }

  private async resolveRoleNames(
    invitations: readonly PresentableInvitation[],
  ): Promise<ReadonlyMap<string, string>> {
    const codes = [...new Set(invitations.flatMap((invitation) => invitation.roleCodes))];
    return this.userInvitationRepository.findRoleNamesByCodes(codes);
  }

  private presentInvitation(
    invitation: PresentableInvitation,
    roleNameByCode: ReadonlyMap<string, string>,
    now: Date = new Date(),
  ): UserInvitationView {
    return {
      id: invitation.id,
      email: invitation.email,
      status: resolveInvitationStatus(invitation, now),
      // A role deleted after the invitation was sent falls back to its code
      // rather than vanishing from the row: the pending list is where an
      // administrator finds out the invitation will fail at accept time, and
      // an invitation that displayed no roles at all would look fine.
      roles: invitation.roleCodes.map((code) => ({
        code,
        name: roleNameByCode.get(code) ?? code,
      })),
      invitedByEmail: invitation.invitedBy?.email ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      consumedAt: invitation.consumedAt?.toISOString() ?? null,
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
    };
  }

  private async assertRoleCodesExist(roleCodes: string[]): Promise<void> {
    const roles = await this.adminManagementRepository.findActiveRolesByCodes(roleCodes);
    if (roles.length !== roleCodes.length) {
      throw new BadRequestException('One or more role codes are invalid');
    }
  }

  /**
   * Mirrors `AdminManagementService`: only a SUPER_ADMIN may hand out
   * SUPER_ADMIN. Repeated rather than shared because the invite path is the
   * one that mints a *new* privileged account without anyone typing its
   * password, so it must not be able to fall out of step with the direct
   * create path by being refactored around.
   */
  private async assertCanAssignRoleCodes(
    roleCodes: string[],
    currentUserId: string,
  ): Promise<void> {
    const hasPrivilegedRoleCode = roleCodes.some((roleCode) => PRIVILEGED_ROLE_CODES.has(roleCode));
    if (!hasPrivilegedRoleCode) {
      return;
    }
    const actor = await this.authRepository.findUserById(currentUserId);
    const isActorSuperAdmin =
      actor?.roles.some((userRole) => userRole.role.code === SUPER_ADMIN_ROLE_CODE) ?? false;
    if (!isActorSuperAdmin) {
      throw new ForbiddenException('You are not allowed to assign this role');
    }
  }
}
