import { classifyAntenatalLabResult } from '#maternal-reporting/classify-antenatal-lab-result';
import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { AntenatalVisitCodeValue } from '#maternal-care/types';
import type {
  AntenatalLabOutcome,
  AntenatalLabTest,
  MaternalReportAntenatalVisitSource,
  MonthlyKiaSource,
} from '#maternal-reporting/types';

/** Hb below this is anaemia; 8–11 g/dL is the LB3-KIA "ringan-sedang" band. */
const HAEMOGLOBIN_ANEMIA_UPPER_G_PER_DL = 11;
/** Hb below this is the LB3-KIA "berat" band. */
const HAEMOGLOBIN_SEVERE_G_PER_DL = 8;

type CountAntenatalLabVisitsParams = {
  readonly source: MonthlyKiaSource;
  readonly test: AntenatalLabTest;
  readonly outcome: AntenatalLabOutcome;
  /** Restrict to visits carrying one of these K-codes (Hb at K1, Hb at K4). */
  readonly visitCodes?: readonly AntenatalVisitCodeValue[];
};

function isVisitInScope(
  visit: MaternalReportAntenatalVisitSource,
  params: CountAntenatalLabVisitsParams,
): boolean {
  if (!isWithinMaternalReportMonth(visit.startedAt, params.source.range)) {
    return false;
  }
  return (
    params.visitCodes === undefined ||
    (visit.visitCode !== null && params.visitCodes.includes(visit.visitCode))
  );
}

function matchesOutcome(
  haemoglobin: number | null,
  isPositive: boolean,
  outcome: AntenatalLabOutcome,
): boolean {
  switch (outcome) {
    case 'EXAMINED':
      return true;
    case 'POSITIVE':
      return isPositive;
    case 'ANEMIA_MILD':
      return (
        haemoglobin !== null &&
        haemoglobin >= HAEMOGLOBIN_SEVERE_G_PER_DL &&
        haemoglobin < HAEMOGLOBIN_ANEMIA_UPPER_G_PER_DL
      );
    case 'ANEMIA_SEVERE':
      return haemoglobin !== null && haemoglobin < HAEMOGLOBIN_SEVERE_G_PER_DL;
  }
}

/**
 * Mothers examined for one LB3-KIA laboratory test in the month, or those
 * whose result read positive or anaemic (P25-T15, D-040). One mother counts
 * once per test however many visits she had; the result read is the latest
 * one recorded on her in-scope visits. "Hb K1" and "Hb K4" pass `visitCodes`
 * so only the visit the sheet names is read.
 */
export function countAntenatalLabVisits(params: CountAntenatalLabVisitsParams): number {
  const latestByEpisode = new Map<string, { haemoglobin: number | null; isPositive: boolean }>();
  for (const visit of params.source.antenatalVisits) {
    if (!isVisitInScope(visit, params)) {
      continue;
    }
    for (const result of visit.labResults) {
      const classification = classifyAntenatalLabResult(result);
      if (classification?.test === params.test) {
        latestByEpisode.set(visit.pregnancyEpisodeId, {
          haemoglobin: classification.haemoglobin,
          isPositive: classification.isPositive,
        });
      }
    }
  }
  return [...latestByEpisode.values()].filter((reading) =>
    matchesOutcome(reading.haemoglobin, reading.isPositive, params.outcome),
  ).length;
}
