/** Reminders go out from 09:00 on the clinic's clock (P25-T17)… */
export const VISIT_REMINDER_SEND_FROM_HOUR = 9;
/**
 * …until noon. The worker ticks more often than daily, so a server restarted
 * mid-morning still sends that day's reminders; a restart in the evening
 * waits for tomorrow rather than messaging a patient at night.
 */
export const VISIT_REMINDER_SEND_UNTIL_HOUR = 12;

/** Whether `instant` falls in the morning send window on the clinic's clock. */
export function isWithinVisitReminderSendWindow(params: {
  instant: Date;
  timeZone: string;
}): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: params.timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(params.instant),
  );
  return hour >= VISIT_REMINDER_SEND_FROM_HOUR && hour < VISIT_REMINDER_SEND_UNTIL_HOUR;
}
