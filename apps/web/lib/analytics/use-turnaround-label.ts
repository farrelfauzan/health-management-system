import { useTranslations } from 'next-intl';

const MINUTES_PER_HOUR = 60;

/** A turnaround as the lab reads it: "45 mnt", "1 j", "2 j 10 mnt"; "—" when there is none. */
export function useTurnaroundLabel(): (minutes: number | null | undefined) => string {
  const t = useTranslations('analytics.laboratory.duration');
  return (minutes) => {
    if (minutes === null || minutes === undefined) {
      return '—';
    }
    if (minutes < MINUTES_PER_HOUR) {
      return t('minutes', { minutes });
    }
    const hours = Math.floor(minutes / MINUTES_PER_HOUR);
    const rest = minutes % MINUTES_PER_HOUR;
    return rest === 0 ? t('hours', { hours }) : t('hoursMinutes', { hours, minutes: rest });
  };
}
