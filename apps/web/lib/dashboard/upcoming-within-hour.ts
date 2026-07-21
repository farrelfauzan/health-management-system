const UPCOMING_WINDOW_MS = 60 * 60 * 1000;
const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED'];

export type UpcomingAppointmentSlot = {
  scheduledAt: string;
  status: string;
};

export function countUpcomingWithinHour(
  appointments: UpcomingAppointmentSlot[],
  now: Date,
): number {
  const windowStart = now.getTime();
  const windowEnd = windowStart + UPCOMING_WINDOW_MS;
  return appointments.filter((appointment) => {
    if (!UPCOMING_STATUSES.includes(appointment.status)) {
      return false;
    }
    const scheduledTime = new Date(appointment.scheduledAt).getTime();
    return scheduledTime >= windowStart && scheduledTime <= windowEnd;
  }).length;
}
