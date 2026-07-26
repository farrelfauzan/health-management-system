import {
  CreateDoctorRecordPayload,
  DoctorLicenseWritePayload,
  ListDoctorsParams,
  ReplaceDoctorSchedulesPayload,
  UpdateDoctorRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const RELATED_PATIENTS_DETAIL_LIMIT = 20;
const SCHEDULE_ORDER_BY: Prisma.DoctorScheduleOrderByWithRelationInput[] = [
  { dayOfWeek: 'asc' },
  { startTime: 'asc' },
];
const SPECIALTY_SELECT = {
  select: {
    id: true,
    name: true,
  },
} satisfies Prisma.SpecialtyDefaultArgs;
const LICENSES_INCLUDE = {
  where: {
    deletedAt: null,
  },
  orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  select: {
    id: true,
    type: true,
    licenseNumber: true,
    issuedAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.DoctorProfile$licensesArgs;

function toLicenseCreateData(license: DoctorLicenseWritePayload): {
  type: DoctorLicenseWritePayload['type'];
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
} {
  return {
    type: license.type,
    licenseNumber: license.licenseNumber,
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
  };
}

@Injectable()
export class DoctorManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listDoctors(params: ListDoctorsParams) {
    const { page, limit, search, specialtyId, patientId, isActive } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...(specialtyId ? { specialtyId } : {}),
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
                  name: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
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
          specialty: SPECIALTY_SELECT,
          _count: {
            select: {
              patients: {
                where: {
                  unassignedAt: null,
                },
              },
            },
          },
          schedules: {
            orderBy: SCHEDULE_ORDER_BY,
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
        specialty: SPECIALTY_SELECT,
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
            id: true,
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
        licenses: LICENSES_INCLUDE,
      },
    });
  }

  async findDoctorByNik(nik: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        nik,
      },
      select: {
        id: true,
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

  async findActiveSpecialtyById(id: string) {
    return this.prisma.findFirstActive(this.prisma.specialty, {
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
          specialtyId: payload.specialtyId,
          phoneNumber: payload.phoneNumber,
          nik: payload.nik ?? null,
          satusehatPractitionerId: payload.satusehatPractitionerId ?? null,
          ownerUserId: payload.ownerUserId ?? null,
          isActive: payload.isActive,
          licenses: {
            create: (payload.licenses ?? []).map(toLicenseCreateData),
          },
        },
        include: {
          specialty: SPECIALTY_SELECT,
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

  async updateDoctor(id: string, payload: UpdateDoctorRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      if (payload.licenses !== undefined) {
        await tx.doctorLicense.updateMany({
          where: {
            doctorId: id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
          },
        });
      }

      return tx.doctorProfile.update({
        where: {
          id,
        },
        data: {
          ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
          ...(payload.specialtyId !== undefined ? { specialtyId: payload.specialtyId } : {}),
          ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
          ...(payload.nik !== undefined ? { nik: payload.nik } : {}),
          ...(payload.satusehatPractitionerId !== undefined
            ? { satusehatPractitionerId: payload.satusehatPractitionerId }
            : {}),
          ...(payload.ownerUserId !== undefined ? { ownerUserId: payload.ownerUserId } : {}),
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
          ...(payload.licenses !== undefined
            ? { licenses: { create: payload.licenses.map(toLicenseCreateData) } }
            : {}),
        },
        include: {
          specialty: SPECIALTY_SELECT,
        },
      });
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
            maxPatients: entry.maxPatients ?? null,
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
