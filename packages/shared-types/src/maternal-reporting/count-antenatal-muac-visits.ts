import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/** LiLA below this is kurang energi kronis (KEK) on the LB3-KIA sheet. */
const KEK_MUAC_THRESHOLD_CM = 23.5;

/**
 * Mothers whose LiLA was measured at an antenatal visit in the month, or —
 * with `outcome = 'KEK'` — whose latest in-month measurement was below
 * 23,5 cm (P25-T15, D-040). One mother counts once.
 */
export function countAntenatalMuacVisits(
  source: MonthlyKiaSource,
  outcome: 'EXAMINED' | 'KEK',
): number {
  const latestByEpisode = new Map<string, number>();
  for (const visit of source.antenatalVisits) {
    if (visit.muacCm === null || !isWithinMaternalReportMonth(visit.startedAt, source.range)) {
      continue;
    }
    latestByEpisode.set(visit.pregnancyEpisodeId, visit.muacCm);
  }
  return [...latestByEpisode.values()].filter(
    (muacCm) => outcome === 'EXAMINED' || muacCm < KEK_MUAC_THRESHOLD_CM,
  ).length;
}
