import {
  CreateDoctorRecordPayload,
  ListDoctorsParams,
  ReplaceDoctorSchedulesPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const RELATED_PATIENTS_DETAIL_LIMIT = 20;

@Injectable()
export class DoctorManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listDoctors(params: ListDoctorsParams) {
    const { page, limit, search, patientId } = params;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
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
      const doctors = await tx.doctorProfile.findMany({
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

      const count = await tx.doctorProfile.count({ where });

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
    return this.prisma.doctorProfile.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async findDoctorDetailById(id: string) {
    return this.prisma.doctorProfile.findFirst({
      where: {
        id,
        deletedAt: null,
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
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
  }

  async findDoctorByLicenseNumber(licenseNumber: string) {
    return this.prisma.doctorProfile.findFirst({
      where: {
        licenseNumber,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
  }

  async findDoctorByOwnerUserId(ownerUserId: string) {
    return this.prisma.doctorProfile.findFirst({
      where: {
        ownerUserId,
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

  async findActivePatientsByIds(ids: string[]) {
    return this.prisma.patientProfile.findMany({
      where: {
        id: {
          in: ids,
        },
        deletedAt: null,
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
