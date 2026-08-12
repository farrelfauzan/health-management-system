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
   */
  async consumeRefreshToken(input: {
    tokenHash: string;
    graceWindowMs: number;
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
        },
      });
      if (!existing) {
        return { outcome: 'INVALID' };
      }
      const now = new Date();
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
