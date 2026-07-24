import {
  CreatePatientRecordPayload,
  ListPatientsParams,
  UpdatePatientRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrismaService } from '../../../common/prisma/prisma.service';

const RELATED_DOCTORS_DETAIL_LIMIT = 20;
const RELATED_DOCTORS_LIST_LIMIT = 3;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

function buildInclusiveEndOfDay(date: Date): Date {
  return new Date(date.getTime() + ONE_DAY_IN_MILLISECONDS);
}

@Injectable()
export class PatientManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(params: ListPatientsParams, currentUser: CurrentUser, hasAnyScope: boolean) {
    const { page, limit, search, doctorId, status, createdFrom, createdTo } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lt: buildInclusiveEndOfDay(createdTo) } : {}),
            },
          }
        : {}),
      ...(doctorId
        ? {
            doctors: {
              some: {
                doctorId,
                unassignedAt: null,
              },
            },
          }
        : {}),
      AND: [
        ...(hasAnyScope
          ? []
          : [
              {
                OR: [
                  { ownerUserId: currentUser.sub },
                  {
                    doctors: {
                      some: {
                        unassignedAt: null,
                        doctor: {
                          ownerUserId: currentUser.sub,
                          deletedAt: null,
                          isActive: true,
                        },
                      },
                    },
                  },
                ],
              },
            ]),
        ...(search
          ? [
              {
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
              },
            ]
          : []),
      ],
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const patients = await this.prisma.findManyActive(tx.patientProfile, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          _count: {
            select: {
              doctors: {
                where: {
                  unassignedAt: null,
                },
              },
            },
          },
          doctors: {
            where: {
              unassignedAt: null,
              doctor: {
                deletedAt: null,
                isActive: true,
              },
            },
            orderBy: {
              assignedAt: 'desc' as const,
            },
            take: RELATED_DOCTORS_LIST_LIMIT,
            select: {
              id: true,
              doctor: {
                select: {
                  id: true,
                  fullName: true,
                  specialty: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      const count = await this.prisma.countActive(tx.patientProfile, { where });

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
    return this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        id,
      },
    });
  }

  async findPatientDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        id,
      },
      include: {
        doctors: {
          where: {
            unassignedAt: null,
            doctor: {
              deletedAt: null,
            },
          },
          orderBy: {
            assignedAt: 'desc',
          },
          take: RELATED_DOCTORS_DETAIL_LIMIT,
          select: {
            id: true,
            doctor: {
              select: {
                id: true,
                fullName: true,
                specialty: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  async findPatientByMrn(mrn: string) {
    return this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        mrn,
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

  async findActiveDoctorsByIds(ids: string[]) {
    return this.prisma.findManyActive(this.prisma.doctorProfile, {
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

  async hasActiveAssignmentWithDoctorUser(patientId: string, doctorUserId: string) {
    const assignmentCount = await this.prisma.doctorPatient.count({
      where: {
        patientId,
        unassignedAt: null,
        doctor: {
          ownerUserId: doctorUserId,
          deletedAt: null,
          isActive: true,
        },
      },
    });

    return assignmentCount > 0;
  }

  async createPatient(payload: CreatePatientRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const patient = await tx.patientProfile.create({
        data: {
          mrn: payload.mrn,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          sex: payload.sex,
          status: payload.status,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          ownerUserId: payload.ownerUserId ?? null,
          isActive: payload.isActive,
        },
      });

      for (const doctorId of payload.doctorIds ?? []) {
        const assignment = await tx.doctorPatient.create({
          data: {
            doctorId,
            patientId: patient.id,
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

      return patient;
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
        ...(payload.sex !== undefined ? { sex: payload.sex } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
        ...(payload.address !== undefined ? { address: payload.address } : {}),
        ...(payload.ownerUserId !== undefined ? { ownerUserId: payload.ownerUserId } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
  }
}
