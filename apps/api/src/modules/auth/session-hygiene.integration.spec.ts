import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuditService } from '../../common/audit/audit.service';
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
import { SessionPolicyService } from './service/session-policy.service';

/**
 * SJ-9 against real Postgres.
 *
 * The whole point of this ticket is that the timeout is a *server-side*
 * control rather than a screen the browser draws over a session that is still
 * alive, so every case here works the way an attacker would: straight at the
 * refresh path, with no client involved. Sessions are aged by writing
 * `lastUsedAt` rather than by waiting, which is the only honest way to test a
 * fifteen-minute threshold in a suite that has to finish in seconds.
 */
describe('Shared-workstation session hygiene against Postgres', () => {
  const TEST_MARKER = 'sj9-session-spec';
  const PASSWORD = 'a-perfectly-good-passphrase';
  const IDLE_TIMEOUT_MINUTES = 15;
  const ORIGIN: RequestContext = {
    ipAddress: '198.51.100.150',
    requestId: 'req-sj9',
    userAgent: 'integration-spec',
  };

  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let authService: AuthService;
  let passwordHasher: PasswordHasherService;
  let recordedAudits: Array<{ action: string; metadata?: Record<string, unknown> }>;

  function originFrom(lastOctet: number): RequestContext {
    return { ...ORIGIN, ipAddress: `198.51.100.${lastOctet}` };
  }

  async function createUser(suffix: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${TEST_MARKER}-${suffix}@example.test`,
        passwordHash: await passwordHasher.hashPassword(PASSWORD),
      },
    });
    return user.id;
  }

  async function loginForRefreshToken(suffix: string, lastOctet: number): Promise<string> {
    const outcome = await authService.login(
      { email: `${TEST_MARKER}-${suffix}@example.test`, password: PASSWORD },
      originFrom(lastOctet),
    );
    if (outcome.kind !== 'SESSION') {
      throw new Error(`Expected a session, got ${outcome.kind}`);
    }
    return outcome.session.refreshToken;
  }

  /** Ages every live token of a user, standing in for the passage of time. */
  async function ageSessionBy(userId: string, minutes: number): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { lastUsedAt: new Date(Date.now() - minutes * 60_000) },
    });
  }

  async function readLastUsedAt(userId: string): Promise<Date> {
    const token = await prisma.refreshToken.findFirstOrThrow({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { lastUsedAt: true },
    });
    return token.lastUsedAt;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    authRepository = new AuthRepository(prisma);
    passwordHasher = new PasswordHasherService();
    recordedAudits = [];
    const configService = new ConfigService({
      JWT_ACCESS_SECRET: 'sj9-access-secret',
      JWT_ACCESS_EXPIRES_IN: '5m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      SESSION_IDLE_TIMEOUT_MINUTES: String(IDLE_TIMEOUT_MINUTES),
    });
    const crypto = new MfaCryptoService(configService);
    authService = new AuthService(
      authRepository,
      new JwtService(),
      configService,
      {
        record: async (event: { action: string; metadata?: Record<string, unknown> }) => {
          recordedAudits.push(event);
        },
        recordOrThrow: async () => undefined,
      } as unknown as AuditService,
      new JwtSecretsService(configService),
      passwordHasher,
      new LoginThrottleService(authRepository),
      new MfaRepository(prisma, crypto),
      new MfaEnforcementService(configService, crypto),
      new MfaTicketService(new JwtService(), new JwtSecretsService(configService)),
      new SessionPolicyService(configService),
    );
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
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.loginAttempt.deleteMany({ where: { ipAddress: { startsWith: '198.51.100.' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await prisma.$disconnect();
  });

  describe('idle timeout', () => {
    /** SJ-9 acceptance: a refresh past the threshold is refused server-side. */
    it('refuses a refresh once the session has gone untouched', async () => {
      const userId = await createUser('idle');
      const refreshToken = await loginForRefreshToken('idle', 151);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES + 5);

      await expect(authService.refresh(refreshToken, originFrom(151))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    /**
     * Refusing is not enough. If the family survived, the very same token would
     * work again the moment somebody touched the keyboard — the session has to
     * be genuinely dead, not merely refused once.
     */
    it('kills the whole family, not just the presented token', async () => {
      const userId = await createUser('idle-family');
      const refreshToken = await loginForRefreshToken('idle-family', 152);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES + 5);

      await authService.refresh(refreshToken, originFrom(152)).catch(() => undefined);

      expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    });

    it('records the timeout as its own audit verb', async () => {
      const userId = await createUser('idle-audit');
      const refreshToken = await loginForRefreshToken('idle-audit', 153);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES + 5);

      await authService.refresh(refreshToken, originFrom(153)).catch(() => undefined);

      const timeout = recordedAudits.find((event) => event.action === 'SESSION_TIMEOUT');
      expect(timeout?.metadata).toEqual({ idleTimeoutMinutes: IDLE_TIMEOUT_MINUTES });
      // Not mistaken for theft: a timeout is nobody's fault, and an incident
      // review that cannot tell the two apart is worse than no signal.
      expect(recordedAudits.some((event) => event.action === 'TOKEN_REUSE')).toBe(false);
    });

    it('leaves a session inside the window alone', async () => {
      const userId = await createUser('active');
      const refreshToken = await loginForRefreshToken('active', 154);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES - 5);

      const session = await authService.refresh(refreshToken, originFrom(154));

      expect(session.tokens.accessToken).toBeTruthy();
    });

    /**
     * Rotation is what an active session does, so it has to reset the clock —
     * otherwise every session dies exactly one threshold after login no matter
     * how hard someone is working.
     */
    it('resets the clock on a successful rotation', async () => {
      const userId = await createUser('rotation-resets');
      const refreshToken = await loginForRefreshToken('rotation-resets', 155);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES - 2);

      await authService.refresh(refreshToken, originFrom(155));

      const lastUsedAt = await readLastUsedAt(userId);
      expect(Date.now() - lastUsedAt.getTime()).toBeLessThan(60_000);
    });
  });

  describe('heartbeat', () => {
    it('keeps a live session alive without rotating it', async () => {
      const userId = await createUser('heartbeat');
      const refreshToken = await loginForRefreshToken('heartbeat', 156);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES - 5);
      const tokenCountBefore = await prisma.refreshToken.count({ where: { userId } });

      const actualAlive = await authService.recordSessionActivity(refreshToken);

      expect(actualAlive).toBe(true);
      expect(Date.now() - (await readLastUsedAt(userId)).getTime()).toBeLessThan(60_000);
      // No successor: the point of a heartbeat is to be cheaper than a refresh
      // and to leave the client's cookie untouched.
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(tokenCountBefore);
    });

    /**
     * The property that stops the heartbeat becoming a bypass. A tab left open
     * on a locked terminal must not be able to keep its own session alive
     * forever — otherwise the idle timeout is decorative.
     */
    it('cannot revive a session that has already timed out', async () => {
      const userId = await createUser('heartbeat-late');
      const refreshToken = await loginForRefreshToken('heartbeat-late', 157);
      await ageSessionBy(userId, IDLE_TIMEOUT_MINUTES + 5);

      const actualAlive = await authService.recordSessionActivity(refreshToken);

      expect(actualAlive).toBe(false);
      await expect(authService.refresh(refreshToken, originFrom(157))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('reports a revoked session as gone', async () => {
      const userId = await createUser('heartbeat-revoked');
      const refreshToken = await loginForRefreshToken('heartbeat-revoked', 158);
      await authService.revokeAllSessions(userId, originFrom(158));

      expect(await authService.recordSessionActivity(refreshToken)).toBe(false);
    });

    it('reports an unknown token as gone rather than throwing', async () => {
      expect(await authService.recordSessionActivity('not-a-real-token')).toBe(false);
    });
  });

  describe('lock', () => {
    /** SJ-9 acceptance: one action, family revoked. */
    it('revokes the family and audits the hand-off distinctly', async () => {
      const userId = await createUser('lock');
      const refreshToken = await loginForRefreshToken('lock', 159);

      const result = await authService.lockSession(refreshToken, originFrom(159));

      expect(result.success).toBe(true);
      expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
      expect(recordedAudits.map((event) => event.action)).toContain('SESSION_LOCK');
      // Distinct from an ordinary logout, so "are staff actually locking
      // terminals" stays answerable.
      expect(recordedAudits.some((event) => event.action === 'USER_LOGOUT')).toBe(false);
    });

    it('still audits an ordinary logout as a logout', async () => {
      await createUser('plain-logout');
      const refreshToken = await loginForRefreshToken('plain-logout', 160);

      await authService.logout(refreshToken, originFrom(160));

      expect(recordedAudits.map((event) => event.action)).toContain('USER_LOGOUT');
      expect(recordedAudits.some((event) => event.action === 'SESSION_LOCK')).toBe(false);
    });

    it('succeeds on an unknown token, so it cannot probe which are real', async () => {
      const result = await authService.lockSession('not-a-real-token', originFrom(161));

      expect(result.success).toBe(true);
    });
  });
});
