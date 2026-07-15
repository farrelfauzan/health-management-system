import { Injectable } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrismaService } from '../../../common/prisma/prisma.service';

type ListPatientsParams = {
  page: number;
  limit: number;
  search?: string;
};

type CreatePatientRecordPayload = {
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
  phoneNumber: string;
  address: string;
  ownerUserId?: string;
  isActive: boolean;
};

type UpdatePatientRecordPayload = {
  fullName?: string;
  dateOfBirth?: Date;
  phoneNumber?: string;
  address?: string;
  ownerUserId?: string | null;
  isActive?: boolean;
};

@Injectable()
export class PatientManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(params: ListPatientsParams, currentUser: CurrentUser, hasAnyScope: boolean) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(hasAnyScope ? {} : { ownerUserId: currentUser.sub }),
      ...(search
        ? {
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                mrn: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const patients = await tx.patientProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const count = await tx.patientProfile.count({ where });

      return [patients, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findPatientById(id: string) {
    return this.prisma.patientProfile.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async findPatientByMrn(mrn: string) {
    return this.prisma.patientProfile.findFirst({
      where: {
        mrn,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  }

  async findActiveUserById(id: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async createPatient(payload: CreatePatientRecordPayload) {
    return this.prisma.patientProfile.create({
      data: {
        mrn: payload.mrn,
        fullName: payload.fullName,
        dateOfBirth: payload.dateOfBirth,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        ownerUserId: payload.ownerUserId ?? null,
        isActive: payload.isActive,
      },
    });
  }

  async updatePatient(id: string, payload: UpdatePatientRecordPayload) {
    return this.prisma.patientProfile.update({
      where: {
        id,
      },
      data: {
        ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
        ...(payload.dateOfBirth !== undefined ? { dateOfBirth: payload.dateOfBirth } : {}),
        ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
        ...(payload.address !== undefined ? { address: payload.address } : {}),
        ...(payload.ownerUserId !== undefined ? { ownerUserId: payload.ownerUserId } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
  }
}
