import { AppointmentStatus, Prisma } from '../../../generated/prisma/client';

/** Bookings that hold a place in a session, as every capacity count reads them. */
const SESSION_CAPACITY_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'COMPLETED'];

/**
 * The session columns every listing needs, including where a `MOVED`
 * occurrence went (P28-T04) so the calendar can point at the replacement.
 */
export const SESSION_WITH_COUNT_SELECT = {
  id: true,
  doctorId: true,
  scheduleId: true,
  sessionDate: true,
  startTime: true,
  endTime: true,
  maxPatients: true,
  status: true,
  statusReason: true,
  movedToSessionId: true,
  movedTo: {
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      endTime: true,
    },
  },
  _count: {
    select: {
      appointments: {
        where: {
          status: {
            in: SESSION_CAPACITY_STATUSES,
          },
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.AppointmentSessionSelect;
