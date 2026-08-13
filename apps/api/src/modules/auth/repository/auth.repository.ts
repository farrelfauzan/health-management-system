import { Injectable } from '@nestjs/common';

import {
  ConsumeRefreshTokenResult,
  RefreshTokenRecordPayload,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string) {
    return this.prisma.findFirstActive(this.prisma.user, {
      where: {
        email,
        isActive: true,
      },
      include: {
        roles: {
          where: {
            deletedAt: null,
          },
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findUserById(id: string) {
    return this.prisma.findFirstActive(this.prisma.user, {
      where: {
        id,
        isActive: true,
      },
      include: {
        roles: {
          where: {
            deletedAt: null,
          },
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createRefreshToken(payload: RefreshTokenRecordPayload): Promise<void> {
    await this.prisma.refreshToken.create({
      data: payload,
    });
  }

  /**
   * The rotation state machine (SJ-6), run as one transaction so two tabs
   * racing cannot both mint a successor from the same token.
   *
   * Four outcomes, and the interesting one is the third:
   *
   * - unknown hash            -> INVALID, nothing to revoke
   * - live token              -> ROTATED: consumed, successor issued
   * - consumed inside grace   -> GRACE_REISSUED: a sibling successor, family
   *                             untouched. Two tabs waking from an expired
   *                             access token is ordinary, not an attack, and
   *                             killing the session for it trains people to
   *                             expect random logouts.
   * - consumed outside grace,
   *   or already revoked      -> REUSE_DETECTED: the whole family dies.
   *
   * The grace path issues a *new* sibling rather than returning the original
   * successor, which the ticket sketched: we store only hashes, so the
   * successor's plaintext no longer exists to hand back. Both tabs end up
   * holding valid tokens in the same family, which is the property that
   * mattered.
   *
   * SJ-9 adds a fifth outcome ahead of the others, `IDLE_TIMEOUT`, for a
   * family nobody has touched inside the threshold.
   */
  async consumeRefreshToken(input: {
    tokenHash: string;
    graceWindowMs: number;
    /** Omitted only where the idle policy does not apply. */
    idleTimeoutMs?: number;
    nextToken: RefreshTokenRecordPayload;
  }): Promise<ConsumeRefreshTokenResult> {
    return this.prisma.executeTransaction(async (tx): Promise<ConsumeRefreshTokenResult> => {
      const existing = await tx.refreshToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
          lastUsedAt: true,
        },
      });
      if (!existing) {
        return { outcome: 'INVALID' };
      }
      const now = new Date();
      // SJ-9 — the idle check sits before every other verdict except "this
      // token was already dead". A session nobody has touched for the
      // threshold is over, and it should not matter whether the token
      // presented is live, consumed, or inside the grace window: all three
      // mean the same thing on an abandoned terminal.
      if (input.idleTimeoutMs !== undefined && !existing.revokedAt) {
        const idleForMs = now.getTime() - existing.lastUsedAt.getTime();
        if (idleForMs > input.idleTimeoutMs) {
          await revokeFamily(tx, existing.familyId, now);
          return { outcome: 'IDLE_TIMEOUT', userId: existing.userId, familyId: existing.familyId };
        }
      }
      if (existing.revokedAt) {
        // Already dead. Presenting it is either a replay of a token stolen
        // before the family was killed, or a client that missed the memo —
        // and there is no way to tell those apart, so treat it as the former.
        await revokeFamily(tx, existing.familyId, now);
        return { outcome: 'REUSE_DETECTED', userId: existing.userId, familyId: existing.familyId };
      }
      if (existing.expiresAt <= now) {
        return { outcome: 'EXPIRED', userId: existing.userId, familyId: existing.familyId };
      }
      if (existing.consumedAt) {
        const isWithinGrace = now.getTime() - existing.consumedAt.getTime() <= input.graceWindowMs;
        if (!isWithinGrace) {
          await revokeFamily(tx, existing.familyId, now);
          return {
            outcome: 'REUSE_DETECTED',
            userId: existing.userId,
            familyId: existing.familyId,
          };
        }
        await tx.refreshToken.create({ data: input.nextToken });
        return {
          outcome: 'GRACE_REISSUED',
          userId: existing.userId,
          familyId: existing.familyId,
        };
      }
      // `consumedAt: null` in the filter makes the write itself the race
      // arbiter: the loser updates zero rows and falls through to the reuse
      // path on its retry rather than silently minting a second successor.
      const consumed = await tx.refreshToken.updateMany({
        where: { id: existing.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        await revokeFamily(tx, existing.familyId, now);
        return { outcome: 'REUSE_DETECTED', userId: existing.userId, familyId: existing.familyId };
      }
      await tx.refreshToken.create({ data: input.nextToken });
      return { outcome: 'ROTATED', userId: existing.userId, familyId: existing.familyId };
    });
  }

  async findRefreshTokenFamilyByHash(
    tokenHash: string,
  ): Promise<{ familyId: string; userId: string } | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true, userId: true },
    });
  }

  /**
   * Marks a session as still in use without rotating it (SJ-9).
   *
   * The filters are the whole point. A revoked token cannot be resurrected by
   * a heartbeat, an expired one cannot be extended, and — the one that matters
   * most — a session already past the idle threshold cannot be saved by a
   * heartbeat that arrives late. Without that last condition a tab left open
   * on a locked screen could keep its own session alive forever, which is
   * precisely the thing this ticket exists to stop.
   *
   * Returns whether anything was bumped, so the caller can tell a live session
   * from one that is already gone.
   */
  async touchRefreshToken(input: {
    tokenHash: string;
    idleTimeoutMs: number;
  }): Promise<{ userId: string; familyId: string } | null> {
    const now = new Date();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: input.tokenHash },
      select: { id: true, userId: true, familyId: true },
    });
    if (!existing) {
      return null;
    }
    const touched = await this.prisma.refreshToken.updateMany({
      where: {
        id: existing.id,
        revokedAt: null,
        expiresAt: { gt: now },
        lastUsedAt: { gt: new Date(now.getTime() - input.idleTimeoutMs) },
      },
      data: { lastUsedAt: now },
    });
    return touched.count === 1
      ? { userId: existing.userId, familyId: existing.familyId }
      : null;
  }

  async createLoginAttempt(input: {
    identifierHash: string;
    ipAddress: string | null;
    succeeded: boolean;
  }): Promise<void> {
    await this.prisma.loginAttempt.create({ data: input });
  }

  /** Newest first — the throttle walks this until it hits a success. */
  async findRecentLoginAttempts(
    identifierHash: string,
    since: Date,
  ): Promise<Array<{ succeeded: boolean; createdAt: Date }>> {
    return this.prisma.loginAttempt.findMany({
      where: { identifierHash, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { succeeded: true, createdAt: true },
      take: 50,
    });
  }

  async countLoginAttemptsFromIp(ipAddress: string, since: Date): Promise<number> {
    return this.prisma.loginAttempt.count({
      where: { ipAddress, createdAt: { gte: since } },
    });
  }

  async deleteLoginAttemptsBefore(cutoff: Date): Promise<number> {
    const deleted = await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return deleted.count;
  }

  async updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /** Every family for one user — password change, admin action, sign-out-everywhere. */
  async revokeAllUserRefreshTokens(userId: string): Promise<number> {
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return revoked.count;
  }

  /**
   * Drops rows whose usefulness has expired along with the token. Kept well
   * past `expiresAt` so a reuse attempt against a recently expired family
   * still finds a row to recognise rather than reading as an unknown hash.
   */
  async deleteExpiredRefreshTokens(expiredBefore: Date): Promise<number> {
    const deleted = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: expiredBefore } },
    });
    return deleted.count;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}

type RefreshTokenTransaction = {
  refreshToken: { updateMany(args: unknown): Promise<{ count: number }> };
};

async function revokeFamily(
  tx: RefreshTokenTransaction,
  familyId: string,
  revokedAt: Date,
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt },
  });
}
