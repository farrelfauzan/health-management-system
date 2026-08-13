import { randomUUID } from 'node:crypto';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { TOTP } from '@otplib/totp';

import { MfaEnrolment } from '@hms/shared-types';

import { AuditService } from '../../common/audit/audit.service';
import { MfaActor } from '../../common/auth/mfa-actor.type';
import { JwtSecretsService } from '../../common/config/jwt-secrets.service';
import { MfaCryptoService } from '../../common/crypto/mfa-crypto.service';
import { PasswordHasherService } from '../../common/crypto/password-hasher.service';
import { RequestContext } from '../../common/observability/observability.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from './repository/auth.repository';
import { MfaRepository } from './repository/mfa.repository';
import { AuthService } from './service/auth.service';
import { LoginThrottleService } from './service/login-throttle.service';
import { MfaEnforcementService } from './service/mfa-enforcement.service';
import { MfaTicketService } from './service/mfa-ticket.service';
import { MfaService } from './service/mfa.service';
import { createTotpBase32Plugin } from './service/totp-base32.plugin';

/**
 * SJ-8 against real Postgres.
 *
 * Every property this ticket claims is a property of persisted state — the
 * replay watermark, the single-use recovery code, the enforcement decision
 * made at token issuance — so a mocked repository would prove none of it. The
 * clock is the one thing driven synthetically: `epoch` is passed explicitly so
 * drift and replay can be exercised without a two-minute test.
 */
describe('TOTP multi-factor authentication against Postgres', () => {
  const TEST_MARKER = 'sj8-mfa-spec';
  const PASSWORD = 'a-perfectly-good-passphrase';
  /** 32 bytes, hex. Fixed so a failure is reproducible. */
  const ENCRYPTION_KEY = 'b'.repeat(64);
  const ORIGIN: RequestContext = {
    ipAddress: '198.51.100.80',
    requestId: 'req-sj8',
    userAgent: 'integration-spec',
  };

  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let authService: AuthService;
  let mfaService: MfaService;
  let mfaTickets: MfaTicketService;
  let passwordHasher: PasswordHasherService;
  let recordedAudits: Array<{ action: string; metadata?: Record<string, unknown> }>;
  let adminRoleId: string;
  let clinicalRoleId: string;

  /** Reads codes the way a phone would, at a chosen instant. */
  const totp = new TOTP({
    algorithm: 'sha1',
    digits: 6,
    period: 30,
    crypto: new NodeCryptoPlugin(),
    base32: createTotpBase32Plugin(),
  });

  function buildService(overrides: Record<string, string> = {}): {
    auth: AuthService;
    mfa: MfaService;
    tickets: MfaTicketService;
  } {
    const configService = new ConfigService({
      JWT_ACCESS_SECRET: 'sj8-access-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      MFA_SECRET_ENCRYPTION_KEY: ENCRYPTION_KEY,
      ...overrides,
    });
    const crypto = new MfaCryptoService(configService);
    const repository = new MfaRepository(prisma, crypto);
    const enforcement = new MfaEnforcementService(configService, crypto);
    const throttle = new LoginThrottleService(authRepository);
    const auditStub = {
      record: async (event: { action: string; metadata?: Record<string, unknown> }) => {
        recordedAudits.push(event);
      },
      recordOrThrow: async () => undefined,
    } as unknown as AuditService;
    const tickets = new MfaTicketService(new JwtService(), new JwtSecretsService(configService));
    const auth = new AuthService(
      authRepository,
      new JwtService(),
      configService,
      auditStub,
      new JwtSecretsService(configService),
      passwordHasher,
      throttle,
      repository,
      enforcement,
      tickets,
    );
    const mfa = new MfaService(
      repository,
      authRepository,
      enforcement,
      throttle,
      auditStub,
      configService,
    );
    return { auth, mfa, tickets };
  }

  /**
   * Each case gets its own account and its own source address, so failure
   * streaks and the per-IP window never bleed between tests.
   */
  async function createUser(suffix: string, roleId?: string): Promise<string> {
    const email = `${TEST_MARKER}-${suffix}@example.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await passwordHasher.hashPassword(PASSWORD) },
    });
    if (roleId) {
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    }
    return user.id;
  }

  function originFrom(lastOctet: number): RequestContext {
    return { ...ORIGIN, ipAddress: `198.51.100.${lastOctet}` };
  }

  /**
   * Clears the replay watermark that enrolment necessarily set.
   *
   * Verifying enrolment spends the current time step — deliberately, so the
   * activating code cannot be turned around against the challenge endpoint.
   * That leaves every challenge case below unable to use a code for *now*
   * without tripping the replay guard first, which would make each of them a
   * test of the same thing. Resetting the watermark here lets each case
   * exercise exactly the property it names, with no clock arithmetic to drift
   * across a step boundary and flake in CI.
   */
  async function clearReplayWatermark(userId: string): Promise<void> {
    await prisma.mfaCredential.update({
      where: { userId },
      data: { lastAcceptedTimeStep: null },
    });
  }

  async function enrol(
    service: MfaService,
    userId: string,
    origin: RequestContext,
  ): Promise<{ secret: string; recoveryCodes: string[] }> {
    const actor: MfaActor = { userId, viaTicket: false };
    const enrolment: MfaEnrolment = await service.beginEnrolment(actor);
    const code = await totp.generate({ secret: enrolment.secret });
    const { recoveryCodes } = await service.completeEnrolment(actor, code, origin);
    return { secret: enrolment.secret, recoveryCodes };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    authRepository = new AuthRepository(prisma);
    passwordHasher = new PasswordHasherService();
    recordedAudits = [];
    // Two roles built from real permission rows: one privileged by the
    // predicate, one not. Nothing here names a role — the predicate reads
    // capabilities, and these fixtures exist to prove that.
    const adminPermission = await prisma.permission.findUniqueOrThrow({
      where: { permissionKey: 'role.assign:any' },
    });
    const clinicalPermission = await prisma.permission.findUniqueOrThrow({
      where: { permissionKey: 'patient.read:any' },
    });
    const adminRole = await prisma.role.create({
      data: {
        code: `${TEST_MARKER}-privileged`,
        name: 'SJ-8 privileged fixture',
        permissions: { create: [{ permissionId: adminPermission.id }] },
      },
    });
    const clinicalRole = await prisma.role.create({
      data: {
        code: `${TEST_MARKER}-clinical`,
        name: 'SJ-8 clinical fixture',
        permissions: { create: [{ permissionId: clinicalPermission.id }] },
      },
    });
    adminRoleId = adminRole.id;
    clinicalRoleId = clinicalRole.id;
    const services = buildService();
    authService = services.auth;
    mfaService = services.mfa;
    mfaTickets = services.tickets;
  });

  beforeEach(() => {
    recordedAudits = [];
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mfaCredential.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.loginAttempt.deleteMany({ where: { ipAddress: { startsWith: '198.51.100.' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await prisma.rolePermission.deleteMany({ where: { role: { code: { startsWith: TEST_MARKER } } } });
    await prisma.role.deleteMany({ where: { code: { startsWith: TEST_MARKER } } });
    await prisma.permission.deleteMany({ where: { permissionKey: { startsWith: TEST_MARKER } } });
    await prisma.$disconnect();
  });

  describe('the enforcement backstop', () => {
    it('refuses a privileged account an access token on password alone', async () => {
      const userId = await createUser('backstop-privileged', adminRoleId);

      const outcome = await authService.login(
        { email: `${TEST_MARKER}-backstop-privileged@example.test`, password: PASSWORD },
        originFrom(81),
      );

      expect(outcome.kind).toBe('MFA_TICKET');
      if (outcome.kind !== 'MFA_TICKET') {
        throw new Error('unreachable');
      }
      expect(outcome.status).toBe('MFA_ENROLMENT_REQUIRED');
      // No session was created, which is the property that matters: an
      // unenrolled privileged account leaves login holding nothing spendable.
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
    });

    it('leaves a non-privileged account entirely unaffected', async () => {
      const userId = await createUser('backstop-clinical', clinicalRoleId);

      const outcome = await authService.login(
        { email: `${TEST_MARKER}-backstop-clinical@example.test`, password: PASSWORD },
        originFrom(82),
      );

      expect(outcome.kind).toBe('SESSION');
      if (outcome.kind !== 'SESSION') {
        throw new Error('unreachable');
      }
      expect(outcome.enrolmentRequired).toBe(false);
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
    });

    /**
     * SJ-8 acceptance: the privilege predicate derives from permissions. This
     * account starts clinical, gains one export permission, and starts
     * requiring a second factor — with no code change and no role rename.
     */
    it('starts requiring MFA the moment an export permission is granted', async () => {
      const email = `${TEST_MARKER}-promoted@example.test`;
      const userId = await createUser('promoted', clinicalRoleId);
      const beforePromotion = await authService.login({ email, password: PASSWORD }, originFrom(83));
      expect(beforePromotion.kind).toBe('SESSION');
      // Upserted rather than created: a run that dies mid-suite leaves this
      // row behind, and a fixture that cannot be re-run is a fixture that
      // fails for the wrong reason next time.
      const exportPermission = await prisma.permission.upsert({
        where: { permissionKey: `${TEST_MARKER}.export:any` },
        create: {
          permissionKey: `${TEST_MARKER}.export:any`,
          resource: `${TEST_MARKER}Report`,
          action: 'export',
          scope: 'ANY',
        },
        update: {},
      });
      const freshRole = await prisma.role.create({
        data: {
          code: `${TEST_MARKER}-exporter`,
          name: 'SJ-8 exporter fixture',
          permissions: { create: [{ permissionId: exportPermission.id }] },
        },
      });
      await prisma.userRole.create({ data: { userId, roleId: freshRole.id } });

      const afterPromotion = await authService.login({ email, password: PASSWORD }, originFrom(84));

      expect(afterPromotion.kind).toBe('MFA_TICKET');
    });

    /**
     * Refresh is the loophole the login check cannot see: a session opened
     * before a promotion would otherwise keep minting access tokens for a week.
     */
    it('kills a refresh-token family that predates the requirement', async () => {
      const email = `${TEST_MARKER}-refresh-loophole@example.test`;
      const userId = await createUser('refresh-loophole', clinicalRoleId);
      const outcome = await authService.login({ email, password: PASSWORD }, originFrom(85));
      if (outcome.kind !== 'SESSION') {
        throw new Error('expected a session before promotion');
      }
      await prisma.userRole.create({ data: { userId, roleId: adminRoleId } });

      await expect(
        authService.refresh(outcome.session.refreshToken, originFrom(86)),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const liveTokens = await prisma.refreshToken.count({ where: { userId, revokedAt: null } });
      expect(liveTokens).toBe(0);
    });

    it('lets a privileged account through while the grace period is running', async () => {
      const email = `${TEST_MARKER}-grace@example.test`;
      const userId = await createUser('grace', adminRoleId);
      const graceUntil = new Date(Date.now() + 86_400_000);
      const { auth } = buildService({ MFA_ENFORCEMENT_GRACE_UNTIL: graceUntil.toISOString() });

      const outcome = await auth.login({ email, password: PASSWORD }, originFrom(87));

      expect(outcome.kind).toBe('SESSION');
      if (outcome.kind !== 'SESSION') {
        throw new Error('unreachable');
      }
      // Let in, and told. That combination is what a grace period is for.
      expect(outcome.enrolmentRequired).toBe(true);
      expect(outcome.enrolmentDeadline?.toISOString()).toBe(graceUntil.toISOString());
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
    });

    /**
     * Without an encryption key nobody can enrol, so enforcing would lock every
     * administrator out with no route back in. Production cannot reach this
     * state; `validateEnvironment` refuses to boot without the key.
     */
    it('does not enforce on a deployment with no encryption key', async () => {
      const email = `${TEST_MARKER}-unconfigured@example.test`;
      await createUser('unconfigured', adminRoleId);
      const configService = new ConfigService({
        JWT_ACCESS_SECRET: 'sj8-access-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      });
      const crypto = new MfaCryptoService(configService);
      const auth = new AuthService(
        authRepository,
        new JwtService(),
        configService,
        { record: async () => undefined, recordOrThrow: async () => undefined } as unknown as AuditService,
        new JwtSecretsService(configService),
        passwordHasher,
        new LoginThrottleService(authRepository),
        new MfaRepository(prisma, crypto),
        new MfaEnforcementService(configService, crypto),
        new MfaTicketService(new JwtService(), new JwtSecretsService(configService)),
      );

      const outcome = await auth.login({ email, password: PASSWORD }, originFrom(88));

      expect(outcome.kind).toBe('SESSION');
    });
  });

  describe('enrolment', () => {
    it('stores the secret encrypted, never in the clear', async () => {
      const userId = await createUser('sealed');

      const { secret } = await enrol(mfaService, userId, originFrom(89));

      const stored = await prisma.mfaCredential.findUniqueOrThrow({ where: { userId } });
      expect(stored.secretEncrypted).not.toContain(secret);
      expect(Buffer.from(stored.secretEncrypted, 'base64').toString('utf8')).not.toContain(secret);
      expect(stored.verifiedAt).not.toBeNull();
    });

    it('changes nothing until the code is verified', async () => {
      const email = `${TEST_MARKER}-unverified@example.test`;
      const userId = await createUser('unverified', adminRoleId);
      await mfaService.beginEnrolment({ userId, viaTicket: false });

      const outcome = await authService.login({ email, password: PASSWORD }, originFrom(90));

      // Still the enrolment branch, not the challenge branch: an abandoned
      // enrolment must not become something the user has to answer.
      expect(outcome.kind).toBe('MFA_TICKET');
      if (outcome.kind !== 'MFA_TICKET') {
        throw new Error('unreachable');
      }
      expect(outcome.status).toBe('MFA_ENROLMENT_REQUIRED');
    });

    it('refuses a wrong code and leaves the credential unverified', async () => {
      const userId = await createUser('wrong-enrol-code');
      await mfaService.beginEnrolment({ userId, viaTicket: false });

      await expect(
        mfaService.completeEnrolment({ userId, viaTicket: false }, '000000', originFrom(91)),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const stored = await prisma.mfaCredential.findUniqueOrThrow({ where: { userId } });
      expect(stored.verifiedAt).toBeNull();
    });

    /**
     * The refusal here is a security control, not tidiness. Beginning an
     * enrolment overwrites the credential row and clears `verifiedAt`, so
     * without this an attacker holding a stolen access token could strip the
     * victim's second factor just by starting an enrolment they never finish
     * — turning the endpoint that adds a factor into the one that removes it.
     */
    it('refuses to begin a second enrolment over a live credential', async () => {
      const userId = await createUser('double-enrol');
      await enrol(mfaService, userId, originFrom(92));

      await expect(
        mfaService.beginEnrolment({ userId, viaTicket: false }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('leaves the live credential verified after a refused re-enrolment', async () => {
      const userId = await createUser('double-enrol-intact');
      await enrol(mfaService, userId, originFrom(115));
      const before = await prisma.mfaCredential.findUniqueOrThrow({ where: { userId } });

      await mfaService.beginEnrolment({ userId, viaTicket: false }).catch(() => undefined);

      const after = await prisma.mfaCredential.findUniqueOrThrow({ where: { userId } });
      expect(after.verifiedAt).toEqual(before.verifiedAt);
      expect(after.secretEncrypted).toBe(before.secretEncrypted);
    });

    it('still refuses to verify over a live credential', async () => {
      const userId = await createUser('double-verify');
      const { secret } = await enrol(mfaService, userId, originFrom(116));

      await expect(
        mfaService.completeEnrolment(
          { userId, viaTicket: false },
          await totp.generate({ secret }),
          originFrom(116),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('issues ten recovery codes and stores only their hashes', async () => {
      const userId = await createUser('recovery-hashes');

      const { recoveryCodes } = await enrol(mfaService, userId, originFrom(93));

      expect(recoveryCodes).toHaveLength(10);
      const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId } });
      expect(stored).toHaveLength(10);
      const storedBlob = JSON.stringify(stored);
      for (const recoveryCode of recoveryCodes) {
        expect(storedBlob).not.toContain(recoveryCode);
      }
    });

    it('turns a completed login into a challenge on the next attempt', async () => {
      const email = `${TEST_MARKER}-enrolled-admin@example.test`;
      const userId = await createUser('enrolled-admin', adminRoleId);
      await enrol(mfaService, userId, originFrom(94));

      const outcome = await authService.login({ email, password: PASSWORD }, originFrom(95));

      expect(outcome.kind).toBe('MFA_TICKET');
      if (outcome.kind !== 'MFA_TICKET') {
        throw new Error('unreachable');
      }
      expect(outcome.status).toBe('MFA_REQUIRED');
      const claims = await mfaTickets.verifyTicket(outcome.ticket, 'mfa_challenge');
      expect(claims.sub).toBe(userId);
    });
  });

  describe('the challenge', () => {
    it('accepts a current code', async () => {
      const userId = await createUser('challenge-happy');
      const { secret } = await enrol(mfaService, userId, originFrom(96));
      await clearReplayWatermark(userId);

      const actualUserId = await mfaService.answerChallenge(
        userId,
        { code: await totp.generate({ secret }) },
        originFrom(96),
      );

      expect(actualUserId).toBe(userId);
    });

    /**
     * SJ-8 acceptance: the same time step cannot be replayed. Without the
     * watermark a code observed over a shoulder stays valid for the rest of
     * its thirty-second window.
     */
    it('rejects the same code a second time', async () => {
      const userId = await createUser('challenge-replay');
      const { secret } = await enrol(mfaService, userId, originFrom(97));
      await clearReplayWatermark(userId);
      const code = await totp.generate({ secret });
      await mfaService.answerChallenge(userId, { code }, originFrom(97));

      await expect(
        mfaService.answerChallenge(userId, { code }, originFrom(97)),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const failures = recordedAudits.filter((event) => event.action === 'MFA_CHALLENGE_FAILED');
      expect(failures.at(-1)?.metadata).toEqual({ failure: 'REPLAYED_CODE' });
    });

    it('rejects a code from a step already passed, even though it still verifies', async () => {
      const userId = await createUser('challenge-backwards');
      const { secret } = await enrol(mfaService, userId, originFrom(98));
      await clearReplayWatermark(userId);
      const epoch = Math.floor(Date.now() / 1000);
      await mfaService.answerChallenge(
        userId,
        { code: await totp.generate({ secret, epoch }) },
        originFrom(98),
      );

      // One step earlier: still inside the drift window, but behind the
      // watermark, so the drift tolerance must not resurrect it.
      await expect(
        mfaService.answerChallenge(
          userId,
          { code: await totp.generate({ secret, epoch: epoch - 30 }) },
          originFrom(98),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('tolerates a phone one step behind', async () => {
      const userId = await createUser('challenge-drift');
      const { secret } = await enrol(mfaService, userId, originFrom(99));
      await clearReplayWatermark(userId);

      const actualUserId = await mfaService.answerChallenge(
        userId,
        { code: await totp.generate({ secret, epoch: Math.floor(Date.now() / 1000) - 30 }) },
        originFrom(99),
      );

      expect(actualUserId).toBe(userId);
    });

    it('tolerates a phone one step ahead', async () => {
      const userId = await createUser('challenge-drift-ahead');
      const { secret } = await enrol(mfaService, userId, originFrom(114));
      await clearReplayWatermark(userId);

      const actualUserId = await mfaService.answerChallenge(
        userId,
        { code: await totp.generate({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }) },
        originFrom(114),
      );

      expect(actualUserId).toBe(userId);
    });

    it('refuses a code from far outside the drift window', async () => {
      const userId = await createUser('challenge-far-drift');
      const { secret } = await enrol(mfaService, userId, originFrom(100));

      await expect(
        mfaService.answerChallenge(
          userId,
          { code: await totp.generate({ secret, epoch: Math.floor(Date.now() / 1000) + 600 }) },
          originFrom(100),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts a recovery code once and never again', async () => {
      const userId = await createUser('recovery-single-use');
      const { recoveryCodes } = await enrol(mfaService, userId, originFrom(101));
      const recoveryCode = recoveryCodes[0]!;

      const actualUserId = await mfaService.answerChallenge(userId, { recoveryCode }, originFrom(101));
      expect(actualUserId).toBe(userId);

      await expect(
        mfaService.answerChallenge(userId, { recoveryCode }, originFrom(101)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(recordedAudits.some((event) => event.action === 'MFA_RECOVERY_USED')).toBe(true);
      expect(await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } })).toBe(9);
    });

    it('accepts a recovery code typed in capitals with spaces', async () => {
      const userId = await createUser('recovery-normalised');
      const { recoveryCodes } = await enrol(mfaService, userId, originFrom(102));
      const messyCode = ` ${recoveryCodes[0]!.toUpperCase()} `;

      const actualUserId = await mfaService.answerChallenge(
        userId,
        { recoveryCode: messyCode },
        originFrom(102),
      );

      expect(actualUserId).toBe(userId);
    });

    it('will not spend one user’s recovery code on another account', async () => {
      const ownerId = await createUser('recovery-owner');
      const strangerId = await createUser('recovery-stranger');
      const { recoveryCodes } = await enrol(mfaService, ownerId, originFrom(103));
      await enrol(mfaService, strangerId, originFrom(104));

      await expect(
        mfaService.answerChallenge(strangerId, { recoveryCode: recoveryCodes[0]! }, originFrom(104)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await prisma.mfaRecoveryCode.count({ where: { userId: ownerId, usedAt: null } })).toBe(10);
    });

    it('backs off after five failures, the same curve as a password', async () => {
      const userId = await createUser('challenge-throttle');
      await enrol(mfaService, userId, originFrom(105));

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await mfaService
          .answerChallenge(userId, { code: '000000' }, originFrom(105))
          .catch(() => undefined);
      }

      await expect(
        mfaService.answerChallenge(userId, { code: '000000' }, originFrom(105)),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('regenerating invalidates every prior code', async () => {
      const userId = await createUser('recovery-regenerate');
      const { secret, recoveryCodes } = await enrol(mfaService, userId, originFrom(106));
      await clearReplayWatermark(userId);

      const regenerated = await mfaService.regenerateRecoveryCodes(
        userId,
        await totp.generate({ secret }),
        originFrom(106),
      );

      expect(regenerated.recoveryCodes).toHaveLength(10);
      await expect(
        mfaService.answerChallenge(userId, { recoveryCode: recoveryCodes[0]! }, originFrom(106)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('administrative reset', () => {
    it('removes the target’s factor, revokes their sessions and audits the reason', async () => {
      const adminId = await createUser('reset-admin', adminRoleId);
      const targetId = await createUser('reset-target', adminRoleId);
      const { secret: adminSecret } = await enrol(mfaService, adminId, originFrom(107));
      await clearReplayWatermark(adminId);
      await enrol(mfaService, targetId, originFrom(108));
      await prisma.refreshToken.create({
        data: {
          id: randomUUID(),
          userId: targetId,
          familyId: randomUUID(),
          tokenHash: `${TEST_MARKER}-reset-hash`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      await mfaService.resetForUser(
        adminId,
        {
          userId: targetId,
          actorCode: await totp.generate({ secret: adminSecret }),
          reason: 'Lost phone, identity confirmed in person',
        },
        originFrom(107),
      );

      expect(await prisma.mfaCredential.count({ where: { userId: targetId } })).toBe(0);
      expect(await prisma.mfaRecoveryCode.count({ where: { userId: targetId } })).toBe(0);
      expect(await prisma.refreshToken.count({ where: { userId: targetId, revokedAt: null } })).toBe(0);
      const resetAudit = recordedAudits.find((event) => event.action === 'MFA_RESET');
      expect(resetAudit?.metadata).toEqual({ reason: 'Lost phone, identity confirmed in person' });
    });

    /**
     * The reset endpoint is the most abusable action in the feature: it
     * downgrades another account to a password. A hijacked admin session must
     * not be enough to reach it.
     */
    it('refuses an administrator who cannot produce their own code', async () => {
      const adminId = await createUser('reset-admin-badcode', adminRoleId);
      const targetId = await createUser('reset-target-safe', adminRoleId);
      await enrol(mfaService, adminId, originFrom(109));
      await enrol(mfaService, targetId, originFrom(110));

      await expect(
        mfaService.resetForUser(
          adminId,
          { userId: targetId, actorCode: '000000', reason: 'no code' },
          originFrom(109),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(await prisma.mfaCredential.count({ where: { userId: targetId } })).toBe(1);
    });

    /**
     * The new-phone path. Since `beginEnrolment` refuses to overwrite a live
     * credential, this is how someone who still holds their old factor moves
     * to a new one — and it costs nothing extra, because proving the current
     * code is already what the endpoint demands.
     */
    it('lets a user reset their own factor and enrol again', async () => {
      const userId = await createUser('self-reset', adminRoleId);
      const { secret } = await enrol(mfaService, userId, originFrom(117));
      await clearReplayWatermark(userId);

      await mfaService.resetForUser(
        userId,
        {
          userId,
          actorCode: await totp.generate({ secret }),
          reason: 'Moving to a new phone',
        },
        originFrom(117),
      );

      expect(await prisma.mfaCredential.count({ where: { userId } })).toBe(0);
      await expect(mfaService.beginEnrolment({ userId, viaTicket: false })).resolves.toEqual(
        expect.objectContaining({ secret: expect.any(String) }),
      );
    });

    it('refuses an administrator who has not enrolled at all', async () => {
      const adminId = await createUser('reset-admin-unenrolled', adminRoleId);
      const targetId = await createUser('reset-target-untouched', adminRoleId);
      await enrol(mfaService, targetId, originFrom(111));

      await expect(
        mfaService.resetForUser(
          adminId,
          { userId: targetId, actorCode: '123456', reason: 'no factor of my own' },
          originFrom(112),
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(await prisma.mfaCredential.count({ where: { userId: targetId } })).toBe(1);
    });
  });

  describe('status', () => {
    it('reports an enrolled privileged account as enrolled and required', async () => {
      const userId = await createUser('status-enrolled', adminRoleId);
      await enrol(mfaService, userId, originFrom(113));

      const actualStatus = await mfaService.getStatus(userId);

      expect(actualStatus.enrolled).toBe(true);
      expect(actualStatus.required).toBe(true);
      expect(actualStatus.unusedRecoveryCodeCount).toBe(10);
      expect(actualStatus.enrolledAt).toBeDefined();
    });

    it('reports a clinical account as neither enrolled nor required', async () => {
      const userId = await createUser('status-clinical', clinicalRoleId);

      const actualStatus = await mfaService.getStatus(userId);

      expect(actualStatus.enrolled).toBe(false);
      expect(actualStatus.required).toBe(false);
      expect(actualStatus.unusedRecoveryCodeCount).toBe(0);
    });
  });
});
