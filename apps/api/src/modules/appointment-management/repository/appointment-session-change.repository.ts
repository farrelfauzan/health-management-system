import {
  CancelAppointmentSessionRecordPayload,
  CancelAppointmentSessionRecordResult,
  MaterializeAppointmentSessionRecordPayload,
  MoveAppointmentSessionRecordPayload,
  MoveAppointmentSessionRecordResult,
  SessionTargetDayWindows,
  partitionSessionMoveBookings,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AppointmentStatus, RegistrationStatus } from '../../../generated/prisma/client';
import { SESSION_WITH_COUNT_SELECT } from './session-with-count-select';

const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
const LIVE_REGISTRATION_STATUSES: RegistrationStatus[] = ['PENDING', 'CHECKED_IN'];
const CHANGEABLE_SESSION_STATUSES = ['OPEN', 'CLOSED'];

const OPEN_BOOKING_SELECT = {
  id: true,
  bpjsBookingCode: true,
  registration: { select: { status: true } },
  patient: { select: { id: true, mrn: true, fullName: true, ownerUserId: true } },
  prospectivePatient: { select: { id: true, fullName: true } },
} as const;

/**
 * Writes the admin's changes to one practice-session occurrence (P28): make a
 * projected occurrence real, cancel it, or move it to another window in the
 * same week. Each change is one transaction under the source row's lock, so
 * two admins acting on one session serialise and the second sees the first's
 * result.
 */
@Injectable()
export class AppointmentSessionChangeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get-or-create on the same key a booking uses, so an admin acting on an
   * occurrence nobody has booked yet gets the row the first booking would
   * have made (P28-T02). Idempotent.
   */
  async materializeSession(payload: MaterializeAppointmentSessionRecordPayload) {
    return this.prisma.appointmentSession.upsert({
      where: {
        doctorId_sessionDate_startTime: {
          doctorId: payload.doctorId,
          sessionDate: new Date(`${payload.sessionDate}T00:00:00.000Z`),
          startTime: payload.startTime,
        },
      },
      create: {
        doctorId: payload.doctorId,
        scheduleId: payload.scheduleId,
        sessionDate: new Date(`${payload.sessionDate}T00:00:00.000Z`),
        startTime: payload.startTime,
        endTime: payload.endTime,
        maxPatients: payload.maxPatients,
      },
      update: {},
      select: SESSION_WITH_COUNT_SELECT,
    });
  }

  /**
   * The doctor's other windows on a date a session is moving to, for the
   * overlap check: every session row that day, and the weekly windows for
   * that weekday.
   */
  async findTargetDayWindows(params: {
    doctorId: string;
    sessionDate: string;
    dayOfWeek: number;
  }): Promise<SessionTargetDayWindows> {
    const [sessions, schedules] = await Promise.all([
      this.prisma.appointmentSession.findMany({
        where: {
          doctorId: params.doctorId,
          sessionDate: new Date(`${params.sessionDate}T00:00:00.000Z`),
        },
        select: { id: true, startTime: true, endTime: true, status: true },
      }),
      this.prisma.doctorSchedule.findMany({
        where: { doctorId: params.doctorId, dayOfWeek: params.dayOfWeek, isAvailable: true },
        select: { startTime: true, endTime: true },
      }),
    ]);
    return { sessions, schedules };
  }

  /**
   * Cancels the session and every open booking in it, records why, and
   * returns who to tell (P28-T02).
   */
  async cancelSession(
    payload: CancelAppointmentSessionRecordPayload,
  ): Promise<CancelAppointmentSessionRecordResult> {
    return this.prisma.executeTransaction(async (tx) => {
      const source = await this.lockChangeableSession(tx, payload.sessionId);
      if (!source) {
        return { outcome: 'NOT_CANCELLABLE' };
      }
      const bookings = await this.findOpenBookings(tx, payload.sessionId);
      const bookingIds = bookings.map((booking) => booking.id);
      await tx.appointment.updateMany({
        where: { id: { in: bookingIds } },
        data: { status: 'CANCELLED' },
      });
      await tx.appointmentSession.update({
        where: { id: payload.sessionId },
        data: { status: 'CANCELLED', statusReason: payload.reason },
      });
      await tx.appointmentSessionChange.create({
        data: {
          sessionId: payload.sessionId,
          kind: 'CANCELLED',
          reason: payload.reason,
          cancelledCount: bookingIds.length,
          actorUserId: payload.actorUserId,
        },
      });
      return {
        outcome: 'CANCELLED',
        doctorName: source.doctorName,
        cancelled: bookings.map((booking) => ({
          appointmentId: booking.id,
          recipientUserId: booking.patient?.ownerUserId ?? null,
        })),
      };
    });
  }

  /**
   * Moves the occurrence to a new replacement session in the same week
   * (P28-T04). The source stays at its original start as a `MOVED` tombstone
   * pointing at the replacement; the bookings that follow keep their id,
   * booking code and queue number — the replacement is new and empty, so the
   * numbers cannot collide — and only their session and start change.
   */
  async moveSession(
    payload: MoveAppointmentSessionRecordPayload,
  ): Promise<MoveAppointmentSessionRecordResult> {
    return this.prisma.executeTransaction(async (tx) => {
      const source = await this.lockChangeableSession(tx, payload.sourceSessionId);
      if (!source) {
        return { outcome: 'SOURCE_NOT_MOVABLE' };
      }
      const targetSessionDate = new Date(`${payload.targetSessionDate}T00:00:00.000Z`);
      const startTaken = await tx.appointmentSession.findUnique({
        where: {
          doctorId_sessionDate_startTime: {
            doctorId: source.doctorId,
            sessionDate: targetSessionDate,
            startTime: payload.startTime,
          },
        },
        select: { id: true },
      });
      if (startTaken) {
        return { outcome: 'TARGET_START_TAKEN' };
      }
      const bookings = await this.findOpenBookings(tx, payload.sourceSessionId);
      const partition = partitionSessionMoveBookings({
        bookings: bookings.map((booking) => ({
          appointmentId: booking.id,
          bpjsBookingCode: booking.bpjsBookingCode,
          hasLiveRegistration:
            booking.registration !== null &&
            LIVE_REGISTRATION_STATUSES.includes(booking.registration.status),
        })),
        isSameDay: payload.isSameDay,
      });
      const maxPatients =
        payload.maxPatients === undefined ? source.maxPatients : payload.maxPatients;
      if (maxPatients !== null && partition.movableIds.length > maxPatients) {
        return {
          outcome: 'CAPACITY_SHORTFALL',
          movableCount: partition.movableIds.length,
          maxPatients,
        };
      }
      const target = await tx.appointmentSession.create({
        data: {
          doctorId: source.doctorId,
          scheduleId: source.scheduleId,
          sessionDate: targetSessionDate,
          startTime: payload.startTime,
          endTime: payload.endTime,
          maxPatients,
          status: source.status,
        },
        select: { id: true },
      });
      await tx.appointment.updateMany({
        where: { id: { in: partition.movableIds } },
        data: { sessionId: target.id, scheduledAt: payload.scheduledAt },
      });
      await tx.appointmentSession.update({
        where: { id: payload.sourceSessionId },
        data: { status: 'MOVED', movedToSessionId: target.id, statusReason: payload.reason },
      });
      await tx.appointmentSessionChange.create({
        data: {
          sessionId: payload.sourceSessionId,
          kind: 'MOVED',
          reason: payload.reason,
          targetSessionId: target.id,
          movedCount: partition.movableIds.length,
          blockedCount: partition.blocked.length,
          actorUserId: payload.actorUserId,
        },
      });
      const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
      return {
        outcome: 'MOVED',
        targetSessionId: target.id,
        doctorName: source.doctorName,
        moved: partition.movableIds.map((appointmentId) => ({
          appointmentId,
          recipientUserId: bookingsById.get(appointmentId)?.patient?.ownerUserId ?? null,
        })),
        blocked: partition.blocked.map((entry) => ({
          ...entry,
          patient: bookingsById.get(entry.appointmentId)?.patient ?? null,
          prospectivePatient: bookingsById.get(entry.appointmentId)?.prospectivePatient ?? null,
        })),
      };
    });
  }

  /**
   * Locks the session row and returns it only while it can still be changed:
   * a cancelled or moved occurrence is final, and a second admin racing the
   * first must see that rather than act on a stale read.
   */
  private async lockChangeableSession(tx: PrismaTransactionClient, sessionId: string) {
    await tx.$queryRaw`SELECT "id" FROM "appointment_sessions" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
    const session = await tx.appointmentSession.findUnique({
      where: { id: sessionId },
      select: {
        doctorId: true,
        scheduleId: true,
        maxPatients: true,
        status: true,
        doctor: { select: { fullName: true } },
      },
    });
    if (!session || !CHANGEABLE_SESSION_STATUSES.includes(session.status)) {
      return null;
    }
    return {
      doctorId: session.doctorId,
      scheduleId: session.scheduleId,
      maxPatients: session.maxPatients,
      status: session.status,
      doctorName: session.doctor.fullName,
    };
  }

  private async findOpenBookings(tx: PrismaTransactionClient, sessionId: string) {
    return tx.appointment.findMany({
      where: {
        sessionId,
        status: { in: OPEN_APPOINTMENT_STATUSES },
        deletedAt: null,
      },
      select: OPEN_BOOKING_SELECT,
      orderBy: [{ queueNumber: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
  }
}
