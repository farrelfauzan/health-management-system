import {
  CreateRegistrationRecordPayload,
  FindOpenRegistrationParams,
  ListQueueBoardParams,
  ListRegistrationsParams,
  UpdateRegistrationRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { Prisma, RegistrationStatus } from '../../../generated/prisma/client';
import { QueueNumberAllocatorRepository } from './queue-number-allocator.repository';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';

const OPEN_REGISTRATION_STATUSES: RegistrationStatus[] = ['PENDING', 'CHECKED_IN'];
const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function buildInclusiveEndOfDay(date: Date): Date {
  return new Date(date.getTime() + ONE_DAY_IN_MILLISECONDS);
}
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
      doctor: {
        select: {
          id: true,
          fullName: true,
          specialty: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationFlowRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueNumberAllocator: QueueNumberAllocatorRepository,
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
  ) {}

  async listRegistrations(params: ListRegistrationsParams) {
    const {
      page,
      limit,
      search,
      status,
      patientId,
      doctorId,
      registeredFrom,
      registeredTo,
      ownerUserId,
    } = params;
    const skip = (page - 1) * limit;

    const patientFilter = {
      ...(ownerUserId ? { ownerUserId } : {}),
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

    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(doctorId
        ? {
            appointment: {
              is: {
                doctorId,
              },
            },
          }
        : {}),
      ...(registeredFrom || registeredTo
        ? {
            registeredAt: {
              ...(registeredFrom ? { gte: registeredFrom } : {}),
              ...(registeredTo ? { lt: buildInclusiveEndOfDay(registeredTo) } : {}),
            },
          }
        : {}),
      ...(Object.keys(patientFilter).length > 0
        ? {
            patient: patientFilter,
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
      const queueNumber = await this.queueNumberAllocator.allocateQueueNumber(
        tx,
        payload.queueDate,
      );
      await this.privacyNoticeRepository.assertCurrentEvidenceOrCapture(
        tx,
        payload.patientId,
        payload.actorUserId,
        payload.privacyNotice,
      );
      return tx.registration.create({
        data: {
          patientId: payload.patientId,
          appointmentId: payload.appointmentId,
          createdById: payload.createdById,
          queueNumber,
          queueDate: payload.queueDate,
        },
        include: REGISTRATION_RELATIONS_INCLUDE,
      });
    });
  }

  async listQueueBoard(params: ListQueueBoardParams) {
    return this.prisma.findManyActive(this.prisma.registration, {
      where: {
        queueDate: params.queueDate,
      },
      orderBy: {
        queueNumber: 'asc',
      },
      include: REGISTRATION_RELATIONS_INCLUDE,
    });
  }

  /**
   * Status moves also drive the BPJS PCare outbox (P11-T05) inside the same
   * transaction — the same deliberate cross-module write as the SATUSEHAT
   * enqueue in EncounterRepository.closeEncounter: a check-in and its
   * pendaftaran queue entry must commit or roll back together, or a BPJS
   * visit silently never reaches PCare. A check-in enqueues PENDAFTARAN only
   * for patients with a stored BPJS number while bridging is active; a
   * cancellation enqueues PENDAFTARAN_DELETE only when the pendaftaran
   * already reached PCare (an unsent row is failed by the worker's own
   * registration-status guard instead — nothing upstream needs revoking).
   */
  async updateRegistration(payload: UpdateRegistrationRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const updated = await tx.registration.update({
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
      if (payload.status === 'CHECKED_IN' && updated.appointmentId) {
        await this.assignSessionQueueNumber(tx, updated.appointmentId);
      }
      if (payload.status === 'CHECKED_IN') {
        if (!updated.checkedInAt) {
          throw new Error('CHECKED_IN registration must have checkedInAt');
        }
        await tx.$executeRaw`
          UPDATE "patient_profiles"
          SET "last_visit_at" = GREATEST(COALESCE("last_visit_at", ${updated.checkedInAt}), ${updated.checkedInAt}),
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${updated.patientId}::uuid
        `;
        await this.enqueueBpjsPendaftaran(tx, updated.id, updated.patientId);
      }
      if (payload.status === 'CANCELLED') {
        await this.propagateBpjsCancellation(tx, updated.id);
      }
      return updated;
    });
  }

  private async enqueueBpjsPendaftaran(
    tx: PrismaTransactionClient,
    registrationId: string,
    patientId: string,
  ): Promise<void> {
    const patient = await tx.patientProfile.findFirst({
      where: { id: patientId },
      select: { bpjsNumberCiphertext: true },
    });
    if (!patient?.bpjsNumberCiphertext) {
      return;
    }
    const activeConfig = await tx.bpjsPcareConfig.findFirst({
      where: { facilityId: null, isActive: true },
      select: { id: true },
    });
    if (!activeConfig) {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN' } },
      create: { registrationId, type: 'PENDAFTARAN' },
      update: {},
    });
  }

  private async propagateBpjsCancellation(
    tx: PrismaTransactionClient,
    registrationId: string,
  ): Promise<void> {
    const pendaftaran = await tx.bpjsSubmission.findUnique({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN' } },
      select: { status: true },
    });
    if (pendaftaran?.status !== 'SUBMITTED') {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'PENDAFTARAN_DELETE' } },
      create: { registrationId, type: 'PENDAFTARAN_DELETE' },
      update: {},
    });
  }

  private async assignSessionQueueNumber(
    tx: PrismaTransactionClient,
    appointmentId: string,
  ): Promise<void> {
    const appointment = await tx.appointment.findFirst({
      where: {
        id: appointmentId,
        type: 'SESSION',
        queueNumber: null,
        sessionId: {
          not: null,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        sessionId: true,
      },
    });
    if (!appointment?.sessionId) {
      return;
    }
    await tx.$queryRaw`SELECT "id" FROM "appointment_sessions" WHERE "id" = ${appointment.sessionId}::uuid FOR UPDATE`;
    const highestQueue = await tx.appointment.aggregate({
      where: {
        sessionId: appointment.sessionId,
        queueNumber: {
          not: null,
        },
      },
      _max: {
        queueNumber: true,
      },
    });
    await tx.appointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        queueNumber: (highestQueue._max.queueNumber ?? 0) + 1,
      },
    });
  }
}
