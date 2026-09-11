import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { JwtSecretsService } from '../../common/config/jwt-secrets.service';
import { PasswordHasherService } from '../../common/crypto/password-hasher.service';
import { RequestContext } from '../../common/observability/observability.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction } from '../../generated/prisma/client';
import { MfaCryptoService } from '../../common/crypto/mfa-crypto.service';
import { AuthRepository } from './repository/auth.repository';
import { MfaRepository } from './repository/mfa.repository';
import { AuthService } from './service/auth.service';
import { LoginThrottleService } from './service/login-throttle.service';
import { MfaEnforcementService } from './service/mfa-enforcement.service';
import { MfaTicketService } from './service/mfa-ticket.service';
import { SessionPolicyService } from './service/session-policy.service';

/**
 * SJ-6's rotation state machine against real Postgres.
 *
 * The transaction, the uniqueness of `token_hash`, and the "did this update
 * touch exactly one row" arbitration are the whole mechanism, and none of them
 * exist against a mocked Prisma — a mock will happily let two callers both
 * consume the same token.
 */
describe('Refresh token rotation against Postgres', () => {
  const TEST_MARKER = 'sj6-rotation-spec';
  const ORIGIN: RequestContext = {
    ipAddress: '203.0.113.42',
    requestId: 'req-sj6',
    userAgent: 'integration-spec',
  };

  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let authService: AuthService;
  let recordedAudits: Array<{ action: string; resourceId?: string | null }>;
  let userId: string;

  function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Each login comes from its own address. SJ-7 added a per-IP ceiling on the
   * login route, and this suite logs in far more often in a minute than any
   * real client would — the throttle is correct and this spec is simply not
   * what it is aimed at.
   */
  let loginCounter = 0;
  async function loginFresh(): Promise<string> {
    loginCounter += 1;
    const outcome = await authService.login(
      { email: `${TEST_MARKER}@example.test`, password: 'password123' },
      { ...ORIGIN, ipAddress: `203.0.113.${loginCounter % 250}` },
    );
    if (outcome.kind !== 'SESSION') {
      throw new Error(`Expected a session, got ${outcome.kind}`);
    }
    return outcome.session.refreshToken;
  }

  const auditServiceStub = {
    record: async (event: { action: string; resourceId?: string | null }) => {
      recordedAudits.push(event);
    },
    recordOrThrow: async () => undefined,
  } as unknown as AuditService;
  const configService = new ConfigService({
    JWT_ACCESS_SECRET: 'sj6-access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });

  function buildAuthService(client: PrismaService, repository: AuthRepository): AuthService {
    return new AuthService(
      repository,
      new JwtService(),
      configService,
      auditServiceStub,
      new JwtSecretsService(configService),
      new PasswordHasherService(),
      new LoginThrottleService(repository),
      // No MFA encryption key in this ConfigService, so enforcement is off and
      // the fixture user logs in the pre-SJ-8 way. Second-factor behaviour is
      // proven in `mfa.integration.spec.ts`.
      new MfaRepository(client, new MfaCryptoService(configService)),
      new MfaEnforcementService(configService, new MfaCryptoService(configService)),
      new MfaTicketService(new JwtService(), new JwtSecretsService(configService)),
      new SessionPolicyService(configService),
    );
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    authRepository = new AuthRepository(prisma);
    recordedAudits = [];
    authService = buildAuthService(prisma, authRepository);

    const { hash } = await import('bcryptjs');
    const user = await prisma.user.create({
      data: {
        email: `${TEST_MARKER}@example.test`,
        passwordHash: await hash('password123', 4),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    recordedAudits = [];
  });

  describe('storage', () => {
    it('persists only a hash — the token itself is never written', async () => {
      const refreshToken = await loginFresh();

      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(refreshToken) },
      });
      expect(stored).not.toBeNull();
      const allColumns = JSON.stringify(stored);
      expect(allColumns).not.toContain(refreshToken);
      expect(stored?.ipAddress).toMatch(/^203\.0\.113\./);
      expect(stored?.userAgent).toBe(ORIGIN.userAgent);
    });

    it('issues 256 bits of randomness, not a JWT', async () => {
      const refreshToken = await loginFresh();

      expect(refreshToken).not.toContain('.');
      expect(Buffer.from(refreshToken, 'base64url')).toHaveLength(32);
    });
  });

  describe('the happy path', () => {
    it('rotates: the successor works and the predecessor is marked consumed', async () => {
      const original = await loginFresh();

      const rotated = await authService.refresh(original, ORIGIN);

      const predecessor = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(original) },
      });
      expect(predecessor?.consumedAt).not.toBeNull();
      expect(predecessor?.revokedAt).toBeNull();
      await expect(authService.refresh(rotated.refreshToken, ORIGIN)).resolves.toMatchObject({
        tokens: { tokenType: 'Bearer' },
      });
    });

    it('keeps the successor in the same family', async () => {
      const original = await loginFresh();

      const rotated = await authService.refresh(original, ORIGIN);

      const [before, after] = await Promise.all([
        prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(original) } }),
        prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rotated.refreshToken) } }),
      ]);
      expect(after?.familyId).toBe(before?.familyId);
    });
  });

  describe('reuse detection', () => {
    it('kills the whole family when a consumed token is replayed outside the grace window', async () => {
      const original = await loginFresh();
      const rotated = await authService.refresh(original, ORIGIN);
      const familyId = (
        await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(original) } })
      )?.familyId;
      // Age the consumption past the window rather than sleeping for it.
      await prisma.$executeRaw`UPDATE "refresh_tokens" SET "consumed_at" = NOW() - INTERVAL '60 seconds' WHERE "token_hash" = ${hashToken(original)}`;

      await expect(authService.refresh(original, ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // The successor the legitimate client is holding dies with the family —
      // that is the point. An attacker replaying a stolen token cannot leave
      // the victim's session running.
      await expect(authService.refresh(rotated.refreshToken, ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const survivors = await prisma.refreshToken.count({
        where: { familyId, revokedAt: null },
      });
      expect(survivors).toBe(0);
    });

    it('records TOKEN_REUSE so the event is findable afterwards', async () => {
      const original = await loginFresh();
      await authService.refresh(original, ORIGIN);
      await prisma.$executeRaw`UPDATE "refresh_tokens" SET "consumed_at" = NOW() - INTERVAL '60 seconds' WHERE "token_hash" = ${hashToken(original)}`;
      recordedAudits = [];

      await expect(authService.refresh(original, ORIGIN)).rejects.toThrow();

      expect(recordedAudits.map((event) => event.action)).toContain(AuditAction.TOKEN_REUSE);
    });

    it('refuses a token from a family that was already revoked', async () => {
      const original = await loginFresh();
      const family = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(original) },
      });
      await authRepository.revokeRefreshTokenFamily(family!.familyId);

      await expect(authService.refresh(original, ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a token that was never issued, without revoking anything', async () => {
      const live = await loginFresh();

      await expect(authService.refresh('not-a-real-token', ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      await expect(authService.refresh(live, ORIGIN)).resolves.toMatchObject({
        tokens: { tokenType: 'Bearer' },
      });
    });
  });

  /**
   * Two tabs waking from the same expired access token. Before the grace
   * window this was indistinguishable from theft, so the second tab killed the
   * session — a logout triggered by nothing but ordinary use.
   */
  describe('the multi-tab grace window', () => {
    it('honours a just-consumed token and leaves the family alone', async () => {
      const original = await loginFresh();
      const firstTab = await authService.refresh(original, ORIGIN);

      const secondTab = await authService.refresh(original, ORIGIN);

      expect(secondTab.refreshToken).not.toBe(firstTab.refreshToken);
      // Both tabs keep working: neither token was collateral damage.
      await expect(authService.refresh(firstTab.refreshToken, ORIGIN)).resolves.toBeDefined();
      await expect(authService.refresh(secondTab.refreshToken, ORIGIN)).resolves.toBeDefined();
      expect(recordedAudits.map((event) => event.action)).not.toContain(AuditAction.TOKEN_REUSE);
    });

    /**
     * The same two tabs, but truly simultaneous: both transactions read the
     * token as live before either writes. Firing two refreshes at one shared
     * pool does not guarantee that — whether they overlap depends on how many
     * connections the pool happens to have open, which is how this case once
     * passed or failed on nothing more than an extra relation in a user query.
     * So each tab gets its own pool, and both are held after their first read
     * until the other has read too.
     */
    describe('when the two transactions overlap', () => {
      const BARRIER_TIMEOUT_MS = 3_000;

      type Tab = {
        client: PrismaService;
        repository: AuthRepository;
        authService: AuthService;
      };
      type TransactionClient = Parameters<Parameters<PrismaService['executeTransaction']>[0]>[0];

      let firstTab: Tab;
      let secondTab: Tab;

      async function openTab(): Promise<Tab> {
        const client = new PrismaService(new ConfigService());
        await client.$connect();
        const repository = new AuthRepository(client);
        return { client, repository, authService: buildAuthService(client, repository) };
      }

      /** Resolves once `parties` callers have arrived, and fails loudly if they never do. */
      function createBarrier(parties: number): () => Promise<void> {
        let arrived = 0;
        let open: () => void = () => undefined;
        const opened = new Promise<void>((resolve) => {
          open = resolve;
        });
        return async () => {
          arrived += 1;
          if (arrived === parties) {
            open();
          }
          let timer: NodeJS.Timeout | undefined;
          const timedOut = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('The racing refreshes never overlapped')),
              BARRIER_TIMEOUT_MS,
            );
          });
          try {
            await Promise.race([opened, timedOut]);
          } finally {
            clearTimeout(timer);
          }
        };
      }

      /**
       * Wraps a transaction so its first `refreshToken.findUnique` runs
       * `interleave` after the row comes back — the gap between reading the
       * token and the guarded update, which is exactly where two tabs collide.
       */
      function gateFirstRead(
        tx: TransactionClient,
        interleave: () => Promise<void>,
      ): TransactionClient {
        let hasGated = false;
        const refreshToken = new Proxy(tx.refreshToken, {
          get(target, property) {
            const value: unknown = Reflect.get(target, property);
            if (property !== 'findUnique' || hasGated) {
              return typeof value === 'function' ? value.bind(target) : value;
            }
            hasGated = true;
            return async (args: Parameters<typeof target.findUnique>[0]) => {
              const row = await target.findUnique(args);
              await interleave();
              return row;
            };
          },
        });
        return new Proxy(tx, {
          get: (target, property) =>
            property === 'refreshToken' ? refreshToken : Reflect.get(target, property),
        });
      }

      function pauseAfterFirstRead(client: PrismaService, interleave: () => Promise<void>): void {
        const executeTransaction = client.executeTransaction.bind(client);
        jest
          .spyOn(client, 'executeTransaction')
          .mockImplementation((work) =>
            executeTransaction((tx) => work(gateFirstRead(tx, interleave))),
          );
      }

      beforeAll(async () => {
        [firstTab, secondTab] = await Promise.all([openTab(), openTab()]);
      });

      afterAll(async () => {
        await Promise.all([firstTab.client.$disconnect(), secondTab.client.$disconnect()]);
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('lets both tabs through and consumes the predecessor exactly once', async () => {
        const original = await loginFresh();
        const tabs = [firstTab, secondTab];
        const arriveAtBarrier = createBarrier(tabs.length);
        tabs.forEach((tab) => pauseAfterFirstRead(tab.client, arriveAtBarrier));
        const consumeSpies = tabs.map((tab) => jest.spyOn(tab.repository, 'consumeRefreshToken'));

        const outcomes = await Promise.allSettled(
          tabs.map((tab) => tab.authService.refresh(original, ORIGIN)),
        );

        // Both succeed — the loser is not treated as an attacker — and the
        // log-out that used to follow is the failure this case exists to catch.
        expect(outcomes).toEqual([
          expect.objectContaining({ status: 'fulfilled' }),
          expect.objectContaining({ status: 'fulfilled' }),
        ]);
        // One rotation and one sibling: the loser did not mint a second
        // successor by consuming the predecessor again.
        const verdicts = await Promise.all(
          consumeSpies.flatMap((spy) => spy.mock.results.map((result) => result.value)),
        );
        expect(verdicts.map((verdict) => verdict.outcome).sort()).toEqual([
          'GRACE_REISSUED',
          'ROTATED',
        ]);
        const predecessor = await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(original) },
        });
        expect(predecessor?.consumedAt).not.toBeNull();
        expect(predecessor?.revokedAt).toBeNull();
        expect(recordedAudits.map((event) => event.action)).not.toContain(AuditAction.TOKEN_REUSE);
        const successors = outcomes.flatMap((outcome) =>
          outcome.status === 'fulfilled' ? [outcome.value.refreshToken] : [],
        );
        for (const successor of successors) {
          await expect(authService.refresh(successor, ORIGIN)).resolves.toBeDefined();
        }
      });

      it('still calls it reuse when the family is revoked between the read and the update', async () => {
        const original = await loginFresh();
        const { familyId } = (await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(original) },
        }))!;
        pauseAfterFirstRead(firstTab.client, () =>
          authRepository.revokeRefreshTokenFamily(familyId),
        );

        await expect(firstTab.authService.refresh(original, ORIGIN)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        expect(recordedAudits.map((event) => event.action)).toContain(AuditAction.TOKEN_REUSE);
      });

      it('still calls it reuse when the update lost to a consumption outside the grace window', async () => {
        const original = await loginFresh();
        const { familyId } = (await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(original) },
        }))!;
        // Losing the guarded update must not buy grace by itself: the row the
        // loser re-reads is judged on its own consumption time.
        pauseAfterFirstRead(firstTab.client, async () => {
          await prisma.$executeRaw`UPDATE "refresh_tokens" SET "consumed_at" = NOW() - INTERVAL '60 seconds' WHERE "token_hash" = ${hashToken(original)}`;
        });

        await expect(firstTab.authService.refresh(original, ORIGIN)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );

        expect(recordedAudits.map((event) => event.action)).toContain(AuditAction.TOKEN_REUSE);
        await expect(
          prisma.refreshToken.count({ where: { familyId, revokedAt: null } }),
        ).resolves.toBe(0);
      });
    });
  });

  describe('global revocation', () => {
    it('revokes every family the user holds', async () => {
      const firstSession = await loginFresh();
      const secondSession = await loginFresh();

      await authService.revokeAllSessions(userId, ORIGIN);

      await expect(authService.refresh(firstSession, ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(authService.refresh(secondSession, ORIGIN)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('cleanup', () => {
    it('purges rows whose expiry is long past, and keeps recent ones', async () => {
      const live = await loginFresh();
      await prisma.$executeRaw`UPDATE "refresh_tokens" SET "expires_at" = NOW() - INTERVAL '90 days' WHERE "token_hash" = ${hashToken(live)}`;
      const recent = await loginFresh();

      const deletedCount = await authRepository.deleteExpiredRefreshTokens(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      );

      expect(deletedCount).toBeGreaterThanOrEqual(1);
      await expect(
        prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(live) } }),
      ).resolves.toBeNull();
      await expect(
        prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(recent) } }),
      ).resolves.not.toBeNull();
    });
  });
});
