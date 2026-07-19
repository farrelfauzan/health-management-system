import {
  CreateRegistrationRecordPayload,
  FindOpenRegistrationParams,
  ListRegistrationsParams,
  UpdateRegistrationRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, RegistrationStatus } from '../../../generated/prisma/client';

const OPEN_REGISTRATION_STATUSES: RegistrationStatus[] = ['PENDING', 'CHECKED_IN'];
const REGISTRATION_RELATIONS_INCLUDE = {
  patient: {
    select: {
      id: true,
      mrn: true,
      fullName: true,
      ownerUserId: true,
    },
  },
  appointment: {
    select: {
      id: true,
      scheduledAt: true,
      status: true,
    },
  },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationFlowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRegistrations(params: ListRegistrationsParams) {
    const { page, limit, status, patientId, registeredFrom, registeredTo, ownerUserId } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(registeredFrom || registeredTo
        ? {
            registeredAt: {
              ...(registeredFrom ? { gte: registeredFrom } : {}),
              ...(registeredTo ? { lte: registeredTo } : {}),
            },
          }
        : {}),
      ...(ownerUserId
        ? {
            patient: {
              ownerUserId,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const registrations = await this.prisma.findManyActive(tx.registration, {
        where,
        skip,
        take: limit,
        orderBy: {
          registeredAt: 'desc',
        },
        include: REGISTRATION_RELATIONS_INCLUDE,
      });

      const count = await this.prisma.countActive(tx.registration, { where });

      return [registrations, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findRegistrationDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.registration, {
      where: {
        id,
      },
      include: REGISTRATION_RELATIONS_INCLUDE,
    });
  }

  async findActivePatientById(id: string) {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });
  }

  async findActiveAppointmentById(id: string) {
    return this.prisma.findFirstActive(this.prisma.appointment, {
      where: {
        id,
      },
      select: {
        id: true,
        patientId: true,
        status: true,
        scheduledAt: true,
      },
    });
  }

  async findRegistrationByAppointmentId(appointmentId: string, excludeRegistrationId?: string) {
    return this.prisma.findFirstActive(this.prisma.registration, {
      where: {
        appointmentId,
        ...(excludeRegistrationId
          ? {
              id: {
                not: excludeRegistrationId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });
  }

  async findOpenRegistrationByPatientId(params: FindOpenRegistrationParams) {
    return this.prisma.findFirstActive(this.prisma.registration, {
      where: {
        patientId: params.patientId,
        status: {
          in: OPEN_REGISTRATION_STATUSES,
        },
        ...(params.excludeRegistrationId
          ? {
              id: {
                not: params.excludeRegistrationId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });
  }

  async createRegistration(payload: CreateRegistrationRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.registration.create({
        data: {
          patientId: payload.patientId,
          appointmentId: payload.appointmentId,
          createdById: payload.createdById,
        },
        include: REGISTRATION_RELATIONS_INCLUDE,
      });
    });
  }

  async updateRegistration(payload: UpdateRegistrationRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.registration.update({
        where: {
          id: payload.id,
        },
        data: {
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.appointmentId !== undefined ? { appointmentId: payload.appointmentId } : {}),
          ...(payload.checkedInAt !== undefined ? { checkedInAt: payload.checkedInAt } : {}),
          ...(payload.completedAt !== undefined ? { completedAt: payload.completedAt } : {}),
        },
        include: REGISTRATION_RELATIONS_INCLUDE,
      });
    });
  }
}
