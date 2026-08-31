import {
  AppointmentScopeActor,
  BookSessionSlotPayload,
  CountActiveFutureAppointmentsSubjectIds,
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
import { buildAppointmentScopeWhere } from './build-appointment-scope-where';
import { buildSessionScopeWhere } from './build-session-scope-where';

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
  // The other half of `P17-T02`'s dual key. Selected on every read that
  // selects `patient`, so `resolveAppointmentSubject` always has both sides in
  // hand -- a read that included only one would resolve to `null` for exactly
  // the bookings the prospective column exists to carry.
  prospectivePatient: {
    select: {
      id: true,
      fullName: true,
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

  async listAppointments(params: ListAppointmentsParams, actor: AppointmentScopeActor) {
    const { page, limit, status, doctorId, patientId, scheduledFrom, scheduledTo } = params;
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
      AND: [buildAppointmentScopeWhere(actor)],
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

  /**
   * Scoped by-ID fetch (SJ-2): the participant scope fragment rides in the
   * SQL `where`, so a row outside the actor's reach is `null` —
   * indistinguishable from a missing appointment.
   */
  async findAppointmentDetailById(id: string, actor: AppointmentScopeActor) {
    const scopedWhere: Prisma.AppointmentWhereInput = {
      id,
      AND: [buildAppointmentScopeWhere(actor)],
    };
    return this.prisma.findFirstActive(this.prisma.appointment, {
      where: scopedWhere,
      include: APPOINTMENT_RELATIONS_INCLUDE,
    });
  }

  /**
   * Looks a booking up by BPJS's own identifier (P14-T04). Used by the inbound
   * `sisa antrean` and `batal antrean` services, which address a booking the
   * way BPJS holds it rather than by an HMS id the member never sees.
   */
  async findAppointmentByBpjsBookingCode(bpjsBookingCode: string) {
    return this.prisma.findFirstActive(this.prisma.appointment, {
      where: {
        bpjsBookingCode,
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

  /**
   * Scoped variant of {@link findActiveDoctorById} for session reads (SJ-2):
   * sessions belong to their doctor, so an `OWN`-scoped actor only reaches a
   * doctor row they own — the same rule {@link buildSessionScopeWhere}
   * applies at the session level, expressed here directly on `ownerUserId`.
   * The unscoped variant stays for appointment creation, where a patient-side
   * caller legitimately references a doctor they do not own.
   */
  async findScopedActiveDoctorById(id: string, actor: AppointmentScopeActor) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        id,
        isActive: true,
        ...(actor.scope === 'OWN' ? { ownerUserId: actor.userId } : {}),
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

      if (payload.bpjsBookingCode !== undefined) {
        const existingByBookingCode = await tx.appointment.findUnique({
          where: { bpjsBookingCode: payload.bpjsBookingCode },
          select: { id: true },
        });
        if (existingByBookingCode) {
          return { outcome: 'DUPLICATE_BOOKING_CODE' };
        }
      }

      // Allocated under the `FOR UPDATE` lock taken above, so concurrent
      // bookings for the same session serialise here and `MAX + 1` cannot hand
      // two patients the same position — the same reasoning as `QueueCounter`,
      // with the session row playing the counter's part. Never renumbered: a
      // cancellation leaves a gap, exactly as a paper ticket roll does.
      const highest = await tx.appointment.aggregate({
        where: { sessionId: session.id },
        _max: { queueNumber: true },
      });
      const queueNumber = (highest._max.queueNumber ?? 0) + 1;

      const created = await tx.appointment.create({
        data: {
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          type: 'SESSION',
          sessionId: session.id,
          queueNumber,
          scheduledAt: payload.scheduledAt,
          status: 'SCHEDULED',
          reason: payload.reason,
          notes: payload.notes,
          createdById: payload.createdById,
          bpjsBookingCode: payload.bpjsBookingCode ?? null,
          bookingSource: payload.bookingSource ?? null,
          bookingReferenceCode: payload.bookingReferenceCode ?? null,
        },
        select: {
          id: true,
        },
      });

      return { outcome: 'BOOKED', appointmentId: created.id, queueNumber };
    });
  }

  /**
   * How many active future appointments these patients already hold, for
   * §8.3's per-number booking cap (`PCS-T07`).
   *
   * Counted across *every* record the phone number resolved to rather than the
   * one being booked against, because a customer who books three times under
   * three spellings of their name creates three drafts, and a cap that counted
   * one of them at a time would not be a cap.
   *
   * Both sides of `P17-T02`'s key, for that same reason. Once `P17-T03` moves
   * chat bookings onto prospective records, a patient-only count would see
   * nothing at all on the channel this cap was written for -- the cap would
   * still run, still pass, and no longer bound anything.
   */
  async countActiveFutureAppointments(
    subjectIds: CountActiveFutureAppointmentsSubjectIds,
    from: Date,
  ): Promise<number> {
    const subjectFilters: Prisma.AppointmentWhereInput[] = [];
    if (subjectIds.patientIds.length > 0) {
      subjectFilters.push({ patientId: { in: [...subjectIds.patientIds] } });
    }
    if (subjectIds.prospectivePatientIds.length > 0) {
      subjectFilters.push({
        prospectivePatientId: { in: [...subjectIds.prospectivePatientIds] },
      });
    }
    if (subjectFilters.length === 0) {
      return 0;
    }
    return this.prisma.appointment.count({
      where: {
        OR: subjectFilters,
        deletedAt: null,
        scheduledAt: { gte: from },
        status: { in: [...OPEN_APPOINTMENT_STATUSES] },
      },
    });
  }

  /**
   * How many bookings the channel has made today for numbers that matched no
   * existing record — §8.3's clinic-wide daily valve on unknown-number
   * bookings.
   *
   * Clinic-wide rather than per-chat on purpose: a per-chat cap is defeated by
   * opening a second chat, which on Telegram costs nothing. This one bounds
   * the damage regardless of how many identities the sender invents, at the
   * price of a busy legitimate day being able to reach it — which is why it is
   * configurable and why hitting it is logged.
   */
  async countChannelDraftBookingsSince(since: Date): Promise<number> {
    return this.prisma.appointment.count({
      where: {
        bookingSource: { not: null },
        createdAt: { gte: since },
        deletedAt: null,
        // Either shape of unknown-number booking: the draft profile the channel
        // used to create, and the prospective record `P17-T03` replaces it
        // with. Both, not one -- this is a security valve, and the window in
        // which the two coexist is exactly when it must not quietly read zero.
        OR: [{ patient: { source: 'CHANNEL_BOOKING' } }, { prospectivePatientId: { not: null } }],
      },
    });
  }

  async listActiveDoctorsWithSchedules(actor: AppointmentScopeActor) {
    return this.prisma.findManyActive(this.prisma.doctorProfile, {
      where: {
        isActive: true,
        // Doctor-side session ownership (see buildSessionScopeWhere), applied
        // at the profile level so an OWN calendar is filtered in SQL.
        ...(actor.scope === 'OWN' ? { ownerUserId: actor.userId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        ownerUserId: true,
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

  /**
   * Scoped session fetch (SJ-2): doctor-side ownership in the SQL `where` —
   * an `OWN` actor probing another doctor's session gets `null`, the same as
   * a missing session.
   */
  async findSessionWithCountById(id: string, actor: AppointmentScopeActor) {
    return this.prisma.appointmentSession.findFirst({
      where: {
        id,
        AND: [buildSessionScopeWhere(actor)],
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
        doctor: {
          select: {
            ownerUserId: true,
          },
        },
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
        prospectivePatient: {
          select: {
            id: true,
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
