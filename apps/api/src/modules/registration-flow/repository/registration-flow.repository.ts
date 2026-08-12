import {
  CreateRegistrationRecordPayload,
  FindOpenRegistrationParams,
  ListQueueBoardParams,
  ListRegistrationsParams,
  RegistrationScopeActor,
  UpdateRegistrationRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { Prisma, RegistrationStatus } from '../../../generated/prisma/client';
import { buildRegistrationScopeWhere } from './build-registration-scope-where';
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
  // The poli the per-poli ticket was drawn from, read from the registration's
  // own column rather than through the appointment: the ticket outlives a
  // later change to the doctor's specialty.
  specialty: {
    select: {
      id: true,
      name: true,
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

  async listRegistrations(params: ListRegistrationsParams, actor: RegistrationScopeActor) {
    const { page, limit, search, status, patientId, doctorId, registeredFrom, registeredTo } =
      params;
    const skip = (page - 1) * limit;

    const patientFilter = {
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
      AND: [buildRegistrationScopeWhere(actor)],
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

  /**
   * Scoped by-ID fetch (SJ-2): the patient-side scope fragment rides in the
   * SQL `where`, so a row outside the actor's reach is `null` —
   * indistinguishable from a missing registration.
   */
  async findRegistrationDetailById(id: string, actor: RegistrationScopeActor) {
    const scopedWhere: Prisma.RegistrationWhereInput = {
      id,
      AND: [buildRegistrationScopeWhere(actor)],
    };
    return this.prisma.findFirstActive(this.prisma.registration, {
      where: scopedWhere,
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
      // The poli is resolved inside the transaction rather than passed in, so
      // the number and the poli it was drawn from are decided against the same
      // snapshot the row is written from.
      const specialtyId = payload.appointmentId
        ? await this.resolveAppointmentSpecialtyId(tx, payload.appointmentId)
        : null;
      const poliQueueNumber = specialtyId
        ? await this.queueNumberAllocator.allocatePoliQueueNumber(
            tx,
            payload.queueDate,
            specialtyId,
          )
        : null;
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
          specialtyId,
          poliQueueNumber,
        },
        include: REGISTRATION_RELATIONS_INCLUDE,
      });
    });
  }

  async listQueueBoard(params: ListQueueBoardParams) {
    return this.prisma.findManyActive(this.prisma.registration, {
      where: {
        queueDate: params.queueDate,
        ...(params.specialtyId ? { specialtyId: params.specialtyId } : {}),
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
      const poliReassignment =
        payload.appointmentId === undefined
          ? undefined
          : await this.resolvePoliReassignment(tx, payload.id, payload.appointmentId);
      const updated = await tx.registration.update({
        where: {
          id: payload.id,
        },
        data: {
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.appointmentId !== undefined ? { appointmentId: payload.appointmentId } : {}),
          ...(payload.checkedInAt !== undefined ? { checkedInAt: payload.checkedInAt } : {}),
          ...(payload.completedAt !== undefined ? { completedAt: payload.completedAt } : {}),
          ...(poliReassignment ?? {}),
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
        await this.enqueueBpjsAntreanAdd(tx, updated.id, updated.patientId, updated.appointmentId);
      }
      if (payload.status === 'CANCELLED') {
        await this.propagateBpjsCancellation(tx, updated.id);
        await this.propagateBpjsAntreanCancellation(tx, updated.id);
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

  /**
   * Publishes a **walk-in's** queue entry to Antrean Online (P14-T05).
   *
   * The provenance check is the load-bearing line: a registration whose
   * appointment carries a `bpjsBookingCode` came from Mobile JKN through the
   * inbound `ambil antrean` service (P14-T04), so BPJS already holds that
   * queue entry. Publishing it back with `antrean/add` would give the member
   * two numbers for one visit — which is exactly why the evaluation §4.4 calls
   * provenance "a second reason that column is not optional".
   *
   * Gated on an active `BpjsAntreanConfig` as well as the card number, so a
   * clinic running PCare bridging with no antrean never accumulates rows for
   * an integration it has not been issued credentials for.
   */
  private async enqueueBpjsAntreanAdd(
    tx: PrismaTransactionClient,
    registrationId: string,
    patientId: string,
    appointmentId: string | null,
  ): Promise<void> {
    const patient = await tx.patientProfile.findFirst({
      where: { id: patientId },
      select: { bpjsNumberCiphertext: true },
    });
    if (!patient?.bpjsNumberCiphertext) {
      return;
    }
    const activeConfig = await tx.bpjsAntreanConfig.findFirst({
      where: { facilityId: null, isActive: true },
      select: { id: true },
    });
    if (!activeConfig) {
      return;
    }
    if (appointmentId !== null && (await this.hasBpjsOriginBooking(tx, appointmentId))) {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'ANTREAN_ADD' } },
      create: { registrationId, type: 'ANTREAN_ADD' },
      update: {},
    });
  }

  private async hasBpjsOriginBooking(
    tx: PrismaTransactionClient,
    appointmentId: string,
  ): Promise<boolean> {
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
      select: { bpjsBookingCode: true },
    });
    return appointment?.bpjsBookingCode != null;
  }

  /**
   * Withdraws a queue entry the clinic published. Mirrors
   * {@link propagateBpjsCancellation}: only a queue entry BPJS actually
   * received is worth cancelling, so an `ANTREAN_ADD` still pending or failed
   * is simply left alone — cancelling something never sent would be an error
   * on BPJS's side and a confusing FAILED row on the monitor.
   */
  private async propagateBpjsAntreanCancellation(
    tx: PrismaTransactionClient,
    registrationId: string,
  ): Promise<void> {
    const antreanAdd = await tx.bpjsSubmission.findUnique({
      where: { registrationId_type: { registrationId, type: 'ANTREAN_ADD' } },
      select: { status: true },
    });
    if (antreanAdd?.status !== 'SUBMITTED') {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: { registrationId_type: { registrationId, type: 'ANTREAN_BATAL' } },
      create: { registrationId, type: 'ANTREAN_BATAL' },
      update: {},
    });
  }

  /**
   * The poli a registration belongs to is its appointment's doctor's
   * specialty — the clinic has no standalone poli entity, and a registration
   * reaches BPJS through exactly that path (see `Specialty.bpjsPoliCode`).
   */
  private async resolveAppointmentSpecialtyId(
    tx: PrismaTransactionClient,
    appointmentId: string,
  ): Promise<string | null> {
    const appointment = await tx.appointment.findFirst({
      where: {
        id: appointmentId,
        deletedAt: null,
      },
      select: {
        doctor: {
          select: {
            specialtyId: true,
          },
        },
      },
    });
    return appointment?.doctor.specialtyId ?? null;
  }

  /**
   * Re-links the per-poli ticket when the appointment link changes, which the
   * service permits only while the registration is still PENDING.
   *
   * A moved patient is issued a *fresh* number from the poli they are actually
   * attending; the old one is abandoned and leaves a gap, exactly as the
   * never-renumbered rule requires. Carrying the old number across would put a
   * patient in a sequence their poli's display never counts to, and reusing it
   * would collide with whoever that poli has already issued it to. Unlinking
   * the appointment clears both columns: there is no longer a poli to queue in.
   *
   * Returns `undefined` when nothing should change, so the caller folds the
   * result into the same `UPDATE` as the rest of the payload.
   */
  private async resolvePoliReassignment(
    tx: PrismaTransactionClient,
    registrationId: string,
    appointmentId: string | null,
  ): Promise<{ specialtyId: string | null; poliQueueNumber: number | null } | undefined> {
    const current = await tx.registration.findUnique({
      where: { id: registrationId },
      select: { specialtyId: true, queueDate: true },
    });
    if (!current) {
      return undefined;
    }
    const nextSpecialtyId = appointmentId
      ? await this.resolveAppointmentSpecialtyId(tx, appointmentId)
      : null;
    if (nextSpecialtyId === current.specialtyId) {
      return undefined;
    }
    if (!nextSpecialtyId) {
      return { specialtyId: null, poliQueueNumber: null };
    }
    // Registrations predating the queue have no `queueDate`, so there is no
    // day to allocate against; they keep their empty ticket rather than
    // acquiring a number retroactively.
    if (!current.queueDate) {
      return undefined;
    }
    return {
      specialtyId: nextSpecialtyId,
      poliQueueNumber: await this.queueNumberAllocator.allocatePoliQueueNumber(
        tx,
        current.queueDate,
        nextSpecialtyId,
      ),
    };
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
