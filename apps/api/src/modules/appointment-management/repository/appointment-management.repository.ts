import {
  CancelAppointmentRecordPayload,
  CreateAppointmentRecordPayload,
  FindConflictingAppointmentParams,
  ListAppointmentsParams,
  UpdateAppointmentRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppointmentStatus, Prisma } from '../../../generated/prisma/client';

const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
const APPOINTMENT_RELATIONS_INCLUDE = {
  patient: {
    select: {
      id: true,
      mrn: true,
      fullName: true,
      ownerUserId: true,
    },
  },
  doctor: {
    select: {
      id: true,
      fullName: true,
      specialty: true,
      ownerUserId: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAppointments(params: ListAppointmentsParams) {
    const { page, limit, status, doctorId, patientId, scheduledFrom, scheduledTo, ownerUserId } =
      params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(patientId ? { patientId } : {}),
      ...(scheduledFrom || scheduledTo
        ? {
            scheduledAt: {
              ...(scheduledFrom ? { gte: scheduledFrom } : {}),
              ...(scheduledTo ? { lte: scheduledTo } : {}),
            },
          }
        : {}),
      ...(ownerUserId
        ? {
            OR: [
              {
                patient: {
                  ownerUserId,
                },
              },
              {
                doctor: {
                  ownerUserId,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const appointments = await this.prisma.findManyActive(tx.appointment, {
        where,
        skip,
        take: limit,
        orderBy: {
          scheduledAt: 'desc',
        },
        include: APPOINTMENT_RELATIONS_INCLUDE,
      });

      const count = await this.prisma.countActive(tx.appointment, { where });

      return [appointments, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findAppointmentDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.appointment, {
      where: {
        id,
      },
      include: APPOINTMENT_RELATIONS_INCLUDE,
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

  async findActiveDoctorById(id: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        ownerUserId: true,
        schedules: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isAvailable: true,
          },
        },
      },
    });
  }

  async findConflictingAppointment(params: FindConflictingAppointmentParams) {
    return this.prisma.findFirstActive(this.prisma.appointment, {
      where: {
        doctorId: params.doctorId,
        scheduledAt: params.scheduledAt,
        status: {
          in: OPEN_APPOINTMENT_STATUSES,
        },
        ...(params.excludeAppointmentId
          ? {
              id: {
                not: params.excludeAppointmentId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });
  }

  async createAppointment(payload: CreateAppointmentRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.appointment.create({
        data: {
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          scheduledAt: payload.scheduledAt,
          reason: payload.reason,
          notes: payload.notes,
          createdById: payload.createdById,
        },
        include: APPOINTMENT_RELATIONS_INCLUDE,
      });
    });
  }

  async updateAppointment(payload: UpdateAppointmentRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.appointment.update({
        where: {
          id: payload.id,
        },
        data: {
          ...(payload.scheduledAt !== undefined ? { scheduledAt: payload.scheduledAt } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        },
        include: APPOINTMENT_RELATIONS_INCLUDE,
      });
    });
  }

  async cancelAppointment(payload: CancelAppointmentRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.appointment.update({
        where: {
          id: payload.id,
        },
        data: {
          status: 'CANCELLED',
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        },
        include: APPOINTMENT_RELATIONS_INCLUDE,
      });
    });
  }
}
