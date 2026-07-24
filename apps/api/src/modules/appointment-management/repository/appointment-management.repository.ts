import {
  BookSessionSlotPayload,
  BookSessionSlotResult,
  CancelAppointmentRecordPayload,
  CreateAppointmentRecordPayload,
  FindConflictingAppointmentParams,
  ListAppointmentsParams,
  ListDoctorSessionsParams,
  UpdateAppointmentRecordPayload,
  UpdateAppointmentSessionRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppointmentStatus, Prisma } from '../../../generated/prisma/client';

const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
const CAPACITY_APPOINTMENT_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED'];
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
      specialty: { select: { name: true } },
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
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isAvailable: true,
            maxPatients: true,
          },
        },
      },
    });
  }

  async findScheduleWindowById(id: string) {
    return this.prisma.doctorSchedule.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        doctorId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isAvailable: true,
        maxPatients: true,
      },
    });
  }

  async findConflictingAppointment(params: FindConflictingAppointmentParams) {
    return this.prisma.findFirstActive(this.prisma.appointment, {
      where: {
        doctorId: params.doctorId,
        scheduledAt: params.scheduledAt,
        type: 'SPECIAL_REQUEST',
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
          type: payload.type,
          status: payload.status,
          scheduledAt: payload.scheduledAt,
          reason: payload.reason,
          notes: payload.notes,
          createdById: payload.createdById,
        },
        include: APPOINTMENT_RELATIONS_INCLUDE,
      });
    });
  }

  async bookSessionSlot(payload: BookSessionSlotPayload): Promise<BookSessionSlotResult> {
    const sessionDate = new Date(`${payload.sessionDate}T00:00:00.000Z`);

    return this.prisma.executeTransaction(async (tx) => {
      const session = await tx.appointmentSession.upsert({
        where: {
          doctorId_sessionDate_startTime: {
            doctorId: payload.doctorId,
            sessionDate,
            startTime: payload.startTime,
          },
        },
        create: {
          doctorId: payload.doctorId,
          scheduleId: payload.scheduleId,
          sessionDate,
          startTime: payload.startTime,
          endTime: payload.endTime,
          maxPatients: payload.maxPatients,
        },
        update: {},
        select: {
          id: true,
        },
      });

      const [lockedSession] = await tx.$queryRaw<
        Array<{ id: string; status: AppointmentStatus | string; max_patients: number | null }>
      >`SELECT "id", "status", "max_patients" FROM "appointment_sessions" WHERE "id" = ${session.id}::uuid FOR UPDATE`;

      if (!lockedSession || lockedSession.status !== 'OPEN') {
        return { outcome: 'SESSION_NOT_OPEN' };
      }

      const existingBooking = await tx.appointment.findFirst({
        where: {
          sessionId: session.id,
          patientId: payload.patientId,
          status: {
            in: OPEN_APPOINTMENT_STATUSES,
          },
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (existingBooking) {
        return { outcome: 'ALREADY_BOOKED' };
      }

      if (lockedSession.max_patients !== null) {
        const bookedCount = await tx.appointment.count({
          where: {
            sessionId: session.id,
            status: {
              in: CAPACITY_APPOINTMENT_STATUSES,
            },
            deletedAt: null,
          },
        });

        if (bookedCount >= lockedSession.max_patients) {
          return { outcome: 'SESSION_FULL' };
        }
      }

      const created = await tx.appointment.create({
        data: {
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          type: 'SESSION',
          sessionId: session.id,
          scheduledAt: payload.scheduledAt,
          status: 'SCHEDULED',
          reason: payload.reason,
          notes: payload.notes,
          createdById: payload.createdById,
        },
        select: {
          id: true,
        },
      });

      return { outcome: 'BOOKED', appointmentId: created.id };
    });
  }

  async listActiveDoctorsWithSchedules() {
    return this.prisma.findManyActive(this.prisma.doctorProfile, {
      where: {
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        specialty: { select: { name: true } },
        schedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isAvailable: true,
            maxPatients: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });
  }

  async listSessionsWithCounts(params: ListDoctorSessionsParams) {
    return this.prisma.appointmentSession.findMany({
      where: {
        ...(params.doctorId ? { doctorId: params.doctorId } : {}),
        sessionDate: {
          gte: new Date(`${params.fromDate}T00:00:00.000Z`),
          lte: new Date(`${params.toDate}T00:00:00.000Z`),
        },
      },
      select: {
        id: true,
        doctorId: true,
        scheduleId: true,
        sessionDate: true,
        startTime: true,
        endTime: true,
        maxPatients: true,
        status: true,
        _count: {
          select: {
            appointments: {
              where: {
                status: {
                  in: CAPACITY_APPOINTMENT_STATUSES,
                },
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findSessionWithCountById(id: string) {
    return this.prisma.appointmentSession.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        doctorId: true,
        scheduleId: true,
        sessionDate: true,
        startTime: true,
        endTime: true,
        maxPatients: true,
        status: true,
        _count: {
          select: {
            appointments: {
              where: {
                status: {
                  in: CAPACITY_APPOINTMENT_STATUSES,
                },
                deletedAt: null,
              },
            },
          },
        },
      },
    });
  }

  async getSessionQueue(sessionId: string) {
    return this.prisma.appointment.findMany({
      where: {
        sessionId,
        status: {
          in: CAPACITY_APPOINTMENT_STATUSES,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        queueNumber: true,
        status: true,
        reason: true,
        patient: {
          select: {
            id: true,
            mrn: true,
            fullName: true,
          },
        },
      },
      orderBy: [
        {
          queueNumber: {
            sort: 'asc',
            nulls: 'last',
          },
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async updateSession(payload: UpdateAppointmentSessionRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const updated = await tx.appointmentSession.update({
        where: {
          id: payload.id,
        },
        data: {
          ...(payload.maxPatients !== undefined ? { maxPatients: payload.maxPatients } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
        },
      });

      if (payload.status === 'CANCELLED') {
        await tx.appointment.updateMany({
          where: {
            sessionId: payload.id,
            status: {
              in: OPEN_APPOINTMENT_STATUSES,
            },
            deletedAt: null,
          },
          data: {
            status: 'CANCELLED',
          },
        });
      }

      return updated;
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
