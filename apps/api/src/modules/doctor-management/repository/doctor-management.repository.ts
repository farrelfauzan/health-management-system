import {
  CreateDoctorRecordPayload,
  ListDoctorsParams,
  ReplaceDoctorSchedulesPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const RELATED_PATIENTS_DETAIL_LIMIT = 20;
const SCHEDULE_ORDER_BY: Prisma.DoctorScheduleOrderByWithRelationInput[] = [
  { dayOfWeek: 'asc' },
  { startTime: 'asc' },
];

@Injectable()
export class DoctorManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listDoctors(params: ListDoctorsParams) {
    const { page, limit, search, patientId, isActive } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...(patientId
        ? {
            patients: {
              some: {
                patientId,
                unassignedAt: null,
              },
            },
          }
        : {}),
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
                licenseNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                specialty: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const doctors = await this.prisma.findManyActive(tx.doctorProfile, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          _count: {
            select: {
              patients: {
                where: {
                  unassignedAt: null,
                },
              },
            },
          },
        },
      });

      const count = await this.prisma.countActive(tx.doctorProfile, { where });

      return [doctors, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findDoctorById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        id,
      },
    });
  }

  async findDoctorDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            patients: {
              where: {
                unassignedAt: null,
              },
            },
          },
        },
        patients: {
          where: {
            unassignedAt: null,
            patient: {
              deletedAt: null,
            },
          },
          orderBy: {
            assignedAt: 'desc',
          },
          take: RELATED_PATIENTS_DETAIL_LIMIT,
          select: {
            patient: {
              select: {
                id: true,
                mrn: true,
                fullName: true,
              },
            },
          },
        },
        schedules: {
          orderBy: SCHEDULE_ORDER_BY,
        },
      },
    });
  }

  async findDoctorByLicenseNumber(licenseNumber: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        licenseNumber,
      },
      select: {
        id: true,
      },
    });
  }

  async findDoctorByOwnerUserId(ownerUserId: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        ownerUserId,
      },
      select: {
        id: true,
      },
    });
  }

  async findActiveUserById(id: string) {
    return this.prisma.findFirstActive(this.prisma.user, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async findActivePatientsByIds(ids: string[]) {
    return this.prisma.findManyActive(this.prisma.patientProfile, {
      where: {
        id: {
          in: ids,
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async createDoctor(payload: CreateDoctorRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const doctor = await tx.doctorProfile.create({
        data: {
          licenseNumber: payload.licenseNumber,
          fullName: payload.fullName,
          specialty: payload.specialty,
          phoneNumber: payload.phoneNumber,
          ownerUserId: payload.ownerUserId ?? null,
          isActive: payload.isActive,
        },
      });

      for (const patientId of payload.patientIds ?? []) {
        const assignment = await tx.doctorPatient.create({
          data: {
            doctorId: doctor.id,
            patientId,
            assignedById: payload.actorUserId,
          },
        });

        await tx.doctorPatientActivity.create({
          data: {
            assignmentId: assignment.id,
            action: 'ASSIGNED',
            actorUserId: payload.actorUserId,
          },
        });
      }

      return doctor;
    });
  }

  async replaceDoctorSchedules(payload: ReplaceDoctorSchedulesPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.doctorSchedule.deleteMany({
        where: {
          doctorId: payload.doctorId,
        },
      });

      for (const entry of payload.entries) {
        await tx.doctorSchedule.create({
          data: {
            doctorId: payload.doctorId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isAvailable: entry.isAvailable,
          },
        });
      }

      return tx.doctorSchedule.findMany({
        where: {
          doctorId: payload.doctorId,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }
}
