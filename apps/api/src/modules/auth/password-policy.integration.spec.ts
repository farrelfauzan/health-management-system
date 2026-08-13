import { hash as bcryptHash } from 'bcryptjs';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuditService } from '../../common/audit/audit.service';
import { JwtSecretsService } from '../../common/config/jwt-secrets.service';
import { PasswordHasherService } from '../../common/crypto/password-hasher.service';
import { RequestContext } from '../../common/observability/observability.types';
import { MfaCryptoService } from '../../common/crypto/mfa-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from './repository/auth.repository';
import { MfaRepository } from './repository/mfa.repository';
import { AuthService } from './service/auth.service';
import { LoginThrottleService } from './service/login-throttle.service';
import { MfaEnforcementService } from './service/mfa-enforcement.service';
import { MfaTicketService } from './service/mfa-ticket.service';

/**
 * SJ-7 against real Postgres. The failure streak, the per-IP window and the
 * transparent hash upgrade are all reads and writes against the database —
 * none of them mean anything against a mock.
 */
describe('Password policy and login throttling against Postgres', () => {
  const TEST_MARKER = 'sj7-password-spec';
  const PASSWORD = 'a-perfectly-good-passphrase';
  const ORIGIN: RequestContext = {
    ipAddress: '198.51.100.7',
    requestId: 'req-sj7',
    userAgent: 'integration-spec',
  };

  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let authService: AuthService;
  let passwordHasher: PasswordHasherService;
  let throttle: LoginThrottleService;
  let email: string;

  /** Each case gets its own account and IP so streaks never bleed across tests. */
  async function createUserWithHash(suffix: string, passwordHash: string): Promise<string> {
    const address = `${TEST_MARKER}-${suffix}@example.test`;
    await prisma.user.create({ data: { email: address, passwordHash } });
    return address;
  }

  function originFrom(ipAddress: string): RequestContext {
    return { ...ORIGIN, ipAddress };
  }

  async function failLoginOnce(address: string, origin: RequestContext): Promise<unknown> {
    return authService.login({ email: address, password: 'wrong-password' }, origin).catch(
      (error: unknown) => error,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    authRepository = new AuthRepository(prisma);
    passwordHasher = new PasswordHasherService();
    throttle = new LoginThrottleService(authRepository);
    const configService = new ConfigService({
      JWT_ACCESS_SECRET: 'sj7-access-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    authService = new AuthService(
      authRepository,
      new JwtService(),
      configService,
      { record: async () => undefined, recordOrThrow: async () => undefined } as unknown as AuditService,
      new JwtSecretsService(configService),
      passwordHasher,
      throttle,
      // No MFA encryption key here, so enforcement is off and these accounts
      // log in the pre-SJ-8 way — this suite is about SJ-7's password paths.
      new MfaRepository(prisma, new MfaCryptoService(configService)),
      new MfaEnforcementService(configService, new MfaCryptoService(configService)),
      new MfaTicketService(new JwtService(), new JwtSecretsService(configService)),
    );
    email = await createUserWithHash('primary', await passwordHasher.hashPassword(PASSWORD));
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.loginAttempt.deleteMany({
      where: { ipAddress: { startsWith: '198.51.100.' } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await prisma.$disconnect();
  });

  describe('transparent hash upgrade', () => {
    /**
     * Every account predating SJ-7 holds a bcrypt hash. They must keep working
     * and quietly become Argon2id — the alternative was a forced reset for the
     * whole clinic on deploy day.
     */
    it('upgrades a legacy bcrypt hash to Argon2id on a successful login', async () => {
      const legacyEmail = await createUserWithHash('legacy', await bcryptHash(PASSWORD, 4));

      await expect(
        authService.login({ email: legacyEmail, password: PASSWORD }, originFrom('198.51.100.11')),
      ).resolves.toBeDefined();

      const upgraded = await prisma.user.findUnique({ where: { email: legacyEmail } });
      expect(upgraded?.passwordHash).toMatch(/^\$argon2id\$/);
      // And the account still logs in with the same password afterwards.
      await expect(
        authService.login({ email: legacyEmail, password: PASSWORD }, originFrom('198.51.100.12')),
      ).resolves.toBeDefined();
    });

    it('leaves a current Argon2id hash untouched', async () => {
      const before = await prisma.user.findUnique({ where: { email } });

      await authService.login({ email, password: PASSWORD }, originFrom('198.51.100.13'));

      const after = await prisma.user.findUnique({ where: { email } });
      expect(after?.passwordHash).toBe(before?.passwordHash);
    });
  });

  describe('account enumeration', () => {
    it('answers identically for an unknown account and a wrong password', async () => {
      const unknownError = (await failLoginOnce(
        `${TEST_MARKER}-nobody@example.test`,
        originFrom('198.51.100.21'),
      )) as UnauthorizedException;
      const wrongPasswordError = (await failLoginOnce(
        email,
        originFrom('198.51.100.22'),
      )) as UnauthorizedException;

      expect(unknownError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(unknownError.getStatus()).toBe(wrongPasswordError.getStatus());
      expect(unknownError.getResponse()).toEqual(wrongPasswordError.getResponse());
    });

    /**
     * The timing half of the same question. The bound is loose on purpose —
     * a shared CI runner cannot support a claim about constant time — but an
     * unknown account returning in ~0 ms while a real one spends ~100 ms in
     * Argon2 is the difference an attacker can measure over the internet, and
     * that gap must be gone.
     */
    it('spends comparable time on an unknown account as on a real one', async () => {
      await passwordHasher.verifyAgainstDummy('warmup');

      const unknownStart = process.hrtime.bigint();
      await failLoginOnce(`${TEST_MARKER}-ghost@example.test`, originFrom('198.51.100.23'));
      const unknownMs = Number(process.hrtime.bigint() - unknownStart) / 1_000_000;

      const knownStart = process.hrtime.bigint();
      await failLoginOnce(email, originFrom('198.51.100.24'));
      const knownMs = Number(process.hrtime.bigint() - knownStart) / 1_000_000;

      expect(unknownMs).toBeGreaterThan(knownMs / 4);
    });

    /**
     * The throttle keys on the submitted address, not on a resolved user — so
     * a nonexistent account backs off too. If it did not, the 429 would answer
     * the question the identical responses above are hiding.
     */
    it('throttles an unknown account exactly as it throttles a real one', async () => {
      const ghostIp = '198.51.100.31';
      const ghostEmail = `${TEST_MARKER}-phantom@example.test`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await failLoginOnce(ghostEmail, originFrom(ghostIp));
      }

      const throttled = (await failLoginOnce(ghostEmail, originFrom(ghostIp))) as HttpException;

      expect(throttled).toBeInstanceOf(HttpException);
      expect(throttled.getStatus()).toBe(429);
    });
  });

  describe('per-account backoff', () => {
    it('lets the first five failures through and backs off the sixth', async () => {
      const backoffIp = '198.51.100.41';
      const backoffEmail = await createUserWithHash(
        'backoff',
        await passwordHasher.hashPassword(PASSWORD),
      );
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const error = (await failLoginOnce(backoffEmail, originFrom(backoffIp))) as HttpException;
        expect(error).toBeInstanceOf(UnauthorizedException);
      }

      const sixth = (await failLoginOnce(backoffEmail, originFrom(backoffIp))) as HttpException;

      expect(sixth.getStatus()).toBe(429);
      expect(sixth.getResponse()).toMatchObject({
        error: { code: 'TOO_MANY_REQUESTS' },
      });
    });

    /**
     * A soft lock, not a hard one. A hard lockout is a denial-of-service handed
     * to anyone who knows a colleague's email address — locking the front desk
     * out during opening hours is worse than the guessing it prevents.
     */
    it('self-heals: the streak is cleared by a success', async () => {
      const healIp = '198.51.100.51';
      const healEmail = await createUserWithHash(
        'heal',
        await passwordHasher.hashPassword(PASSWORD),
      );
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await failLoginOnce(healEmail, originFrom(healIp));
      }
      // Age the streak past its backoff so a legitimate attempt gets through.
      await prisma.$executeRaw`UPDATE "login_attempts" SET "created_at" = NOW() - INTERVAL '30 seconds' WHERE "ip_address" = ${healIp}`;

      await expect(
        authService.login({ email: healEmail, password: PASSWORD }, originFrom(healIp)),
      ).resolves.toBeDefined();

      // Streak reset: a fresh failure is refused as a wrong password, not throttled.
      const afterSuccess = (await failLoginOnce(healEmail, originFrom(healIp))) as HttpException;
      expect(afterSuccess).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('per-IP ceiling', () => {
    it('refuses an eleventh attempt from the same address within the window', async () => {
      const floodIp = '198.51.100.61';
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await failLoginOnce(`${TEST_MARKER}-flood-${attempt}@example.test`, originFrom(floodIp));
      }

      // A different, valid account — the refusal is about the address, not the
      // credential, which is what makes it a per-IP control.
      const blocked = (await authService
        .login({ email, password: PASSWORD }, originFrom(floodIp))
        .catch((error: unknown) => error)) as HttpException;

      expect(blocked).toBeInstanceOf(HttpException);
      expect(blocked.getStatus()).toBe(429);
    });
  });
});
