import {
  CreateAssignmentPayload,
  ListActivitiesParams,
  UnassignAssignmentPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class DoctorPatientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveDoctorById(id: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
      },
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
      },
    });
  }

  async findActiveAssignment(doctorId: string, patientId: string) {
    return this.prisma.doctorPatient.findFirst({
      where: {
        doctorId,
        patientId,
        unassignedAt: null,
      },
    });
  }

  async findAssignmentById(id: string) {
    return this.prisma.doctorPatient.findUnique({
      where: {
        id,
      },
    });
  }

  async createAssignment(payload: CreateAssignmentPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const assignment = await tx.doctorPatient.create({
        data: {
          doctorId: payload.doctorId,
          patientId: payload.patientId,
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

      return assignment;
    });
  }

  async unassignAssignment(payload: UnassignAssignmentPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const assignment = await tx.doctorPatient.update({
        where: {
          id: payload.assignmentId,
        },
        data: {
          unassignedAt: new Date(),
          unassignedById: payload.actorUserId,
        },
      });

      await tx.doctorPatientActivity.create({
        data: {
          assignmentId: assignment.id,
          action: 'UNASSIGNED',
          actorUserId: payload.actorUserId,
        },
      });

      return assignment;
    });
  }

  async listActivities(params: ListActivitiesParams) {
    const { page, limit, doctorId, patientId, action, actorUserId, occurredFrom, occurredTo } =
      params;
    const skip = (page - 1) * limit;

    const where = {
      ...(action ? { action } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(doctorId || patientId
        ? {
            assignment: {
              ...(doctorId ? { doctorId } : {}),
              ...(patientId ? { patientId } : {}),
            },
          }
        : {}),
      ...(occurredFrom || occurredTo
        ? {
            occurredAt: {
              ...(occurredFrom ? { gte: occurredFrom } : {}),
              ...(occurredTo ? { lte: occurredTo } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const activities = await tx.doctorPatientActivity.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          occurredAt: 'desc',
        },
        include: {
          assignment: {
            select: {
              doctorId: true,
              patientId: true,
            },
          },
        },
      });

      const count = await tx.doctorPatientActivity.count({ where });

      return [activities, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }
}
