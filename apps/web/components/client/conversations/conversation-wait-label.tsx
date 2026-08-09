'use client';

import { useTranslations } from 'next-intl';

type ConversationWaitLabelProps = {
  waitingForSeconds: number | null;
};

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * How long a customer has been waiting for a person.
 *
 * The value comes from the server rather than from `Date.now()` here, because
 * the queue is also *sorted* on it and two browsers with drifting clocks would
 * otherwise disagree with each other and with the ordering they were sent.
 *
 * Rendered in whole minutes past the first minute: a queue is read to decide
 * who to answer next, and second-level precision on a number that is already
 * a rounding of "when they last spoke" implies an accuracy nobody has.
 */
export function ConversationWaitLabel({ waitingForSeconds }: ConversationWaitLabelProps) {
  const t = useTranslations('conversations.wait');

  if (waitingForSeconds === null) {
    return <span className="text-slate-400">—</span>;
  }
  if (waitingForSeconds < SECONDS_PER_MINUTE) {
    return <span className="text-slate-600">{t('underAMinute')}</span>;
  }
  const totalMinutes = Math.floor(waitingForSeconds / SECONDS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) {
    return <span className="font-medium text-amber-800">{t('minutes', { count: totalMinutes })}</span>;
  }
  return (
    <span className="font-semibold text-red-800">
      {t('hours', { count: Math.floor(totalMinutes / MINUTES_PER_HOUR) })}
    </span>
  );
}
