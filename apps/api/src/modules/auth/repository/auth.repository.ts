import { Injectable } from '@nestjs/common';

import {
  RefreshTokenRecordPayload,
  RotateRefreshTokenPayload,
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

  async rotateRefreshToken(payload: RotateRefreshTokenPayload): Promise<boolean> {
    return this.prisma.executeTransaction(async (tx): Promise<boolean> => {
      const rotation = await tx.refreshToken.updateMany({
        where: {
          id: payload.currentTokenId,
          familyId: payload.familyId,
          tokenHash: payload.currentTokenHash,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          revokedAt: new Date(),
        },
      });
      if (rotation.count !== 1) {
        await tx.refreshToken.updateMany({
          where: {
            familyId: payload.familyId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
        return false;
      }
      await tx.refreshToken.create({
        data: payload.nextToken,
      });
      return true;
    });
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
