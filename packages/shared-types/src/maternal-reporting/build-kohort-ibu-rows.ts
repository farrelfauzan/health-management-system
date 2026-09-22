import { classifyAntenatalLabResult } from '#maternal-reporting/classify-antenatal-lab-result';
import { computeAgeLabel } from '#maternal-reporting/compute-age-label';
import { formatMaternalReportDate } from '#maternal-reporting/format-maternal-report-date';
import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type { PostnatalVisitCodeValue } from '#maternal-care/schemas';
import type {
  AntenatalLabTest,
  KohortRegisterRow,
  MaternalReportAntenatalVisitSource,
  MaternalReportEpisodeSource,
  MaternalReportLabResultSource,
  MaternalReportMonthRange,
} from '#maternal-reporting/types';

const MONTHS_PER_YEAR = 12;
const LOW_BIRTH_WEIGHT_GRAMS = 2500;
const NOT_RECORDED = MATERNAL_REPORT_LABELS.empty;

function formatDate(instant: Date | null | undefined, timeZone: string): string {
  return instant === null || instant === undefined
    ? NOT_RECORDED
    : formatMaternalReportDate(instant, timeZone);
}

function readLatest<TValue>(
  visits: readonly MaternalReportAntenatalVisitSource[],
  pick: (visit: MaternalReportAntenatalVisitSource) => TValue | null,
): TValue | null {
  return (
    [...visits]
      .reverse()
      .map(pick)
      .find((value) => value !== null) ?? null
  );
}

function readLatestLab(
  visits: readonly MaternalReportAntenatalVisitSource[],
  test: AntenatalLabTest,
): string {
  const results = visits.flatMap((visit) => visit.labResults);
  const matching = results.filter(
    (result: MaternalReportLabResultSource) => classifyAntenatalLabResult(result)?.test === test,
  );
  const latest = matching[matching.length - 1];
  if (latest === undefined) {
    return NOT_RECORDED;
  }
  return (
    latest.valueCoded ??
    latest.valueText ??
    (latest.valueNumeric === null ? NOT_RECORDED : String(latest.valueNumeric))
  );
}

/** The twelve month cells: the K-codes of the visits in each month of the report year. */
function buildVisitGrid(
  visits: readonly MaternalReportAntenatalVisitSource[],
  range: MaternalReportMonthRange,
): string[] {
  const year = range.month.slice(0, 4);
  const cells: string[][] = Array.from({ length: MONTHS_PER_YEAR }, () => []);
  for (const visit of visits) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: range.timeZone,
      year: 'numeric',
      month: '2-digit',
    })
      .format(visit.startedAt)
      .split('-');
    if (parts[0] !== year) {
      continue;
    }
    cells[Number(parts[1]) - 1]?.push(visit.visitCode ?? '•');
  }
  return cells.map((codes) => codes.join(', '));
}

function readPostnatalDate(
  episode: MaternalReportEpisodeSource,
  code: PostnatalVisitCodeValue,
  timeZone: string,
): string {
  const visit = episode.postnatalVisits.find(
    (candidate) => candidate.subject === 'MOTHER' && candidate.visitCode === code,
  );
  return formatDate(visit?.startedAt, timeZone);
}

function buildDeliveryCells(episode: MaternalReportEpisodeSource, timeZone: string): string[] {
  const delivery = episode.delivery;
  if (delivery === null) {
    return Array.from({ length: 7 }, () => NOT_RECORDED);
  }
  const outcomes = delivery.newborns
    .map((newborn) => MATERNAL_REPORT_LABELS.birthOutcome[newborn.outcome])
    .join(', ');
  const weights = delivery.newborns
    .map((newborn) => newborn.birthWeightGrams)
    .filter((weight): weight is number => weight !== null);
  const low = weights.filter((weight) => weight < LOW_BIRTH_WEIGHT_GRAMS);
  const normal = weights.filter((weight) => weight >= LOW_BIRTH_WEIGHT_GRAMS);
  const complications = [
    delivery.perinealTearGrade === 'NONE' ? null : `Robekan ${delivery.perinealTearGrade}`,
    delivery.referredOut
      ? `Dirujuk${delivery.referralReason ? `: ${delivery.referralReason}` : ''}`
      : null,
  ].filter((value): value is string => value !== null);
  return [
    `${formatMaternalReportDate(delivery.birthAt, timeZone)} / ${outcomes}`,
    low.map(String).join(', '),
    normal.map(String).join(', '),
    MATERNAL_REPORT_LABELS.deliveryMode[delivery.mode],
    'Klinik',
    delivery.attendantName,
    complications.join('; '),
  ];
}

/**
 * One kohort ibu row per pregnancy, in the 53-column Kemenkes 2020 order of
 * `KOHORT_IBU_COLUMNS` (P25-T15, D-040). Columns the P25 data never records —
 * jarak kehamilan, skrining TBC and jiwa, TBC mikroskopis, malaria — print
 * blank rather than a guess; the register is copied by hand today and a blank
 * cell is what the bidan fills in herself.
 */
export function buildKohortIbuRows(
  episodes: readonly MaternalReportEpisodeSource[],
  range: MaternalReportMonthRange,
): KohortRegisterRow[] {
  return episodes.map((episode, index) => {
    const visits = episode.antenatalVisits;
    const muacCm = readLatest(visits, (visit) => visit.muacCm);
    const heightCm = readLatest(visits, (visit) => visit.heightCm);
    const tetanus = readLatest(visits, (visit) => visit.tetanusStatus);
    const counselling = [...new Set(visits.flatMap((visit) => visit.counsellingTopics))];
    const caseNotes = visits
      .map((visit) => visit.caseManagementNotes)
      .filter((note): note is string => note !== null && note.trim() !== '');
    const postnatalNotes = episode.postnatalVisits
      .map((visit) => visit.caseManagementNote)
      .filter((note): note is string => note !== null && note.trim() !== '');
    return {
      id: episode.id,
      villageCode: episode.patient.villageCode,
      villageName: episode.patient.villageName,
      values: [
        String(index + 1),
        episode.patient.fullName,
        episode.patient.nikLast4 === null ? NOT_RECORDED : `****${episode.patient.nikLast4}`,
        episode.patient.villageName ?? episode.patient.address,
        episode.patient.hasBpjsNumber
          ? MATERNAL_REPORT_LABELS.payer.JKN
          : MATERNAL_REPORT_LABELS.payer.GENERAL,
        computeAgeLabel(episode.patient.dateOfBirth, range.startInclusive),
        `G${episode.gravida}P${episode.para}A${episode.abortus}`,
        NOT_RECORDED,
        formatMaternalReportDate(episode.estimatedDeliveryDate, 'UTC'),
        heightCm === null ? NOT_RECORDED : String(heightCm),
        muacCm === null ? NOT_RECORDED : String(muacCm),
        tetanus ?? NOT_RECORDED,
        NOT_RECORDED,
        NOT_RECORDED,
        NOT_RECORDED,
        readLatestLab(visits, 'HB'),
        [episode.bloodType, episode.rhesus].filter((value) => value !== null).join(''),
        readLatestLab(visits, 'PROTEIN_URINE'),
        readLatestLab(visits, 'GLUCOSE'),
        readLatestLab(visits, 'HIV'),
        readLatestLab(visits, 'SYPHILIS'),
        readLatestLab(visits, 'HBSAG'),
        NOT_RECORDED,
        NOT_RECORDED,
        NOT_RECORDED,
        counselling.join(', '),
        [episode.riskNotes, ...caseNotes].filter((value) => value !== null).join('; '),
        ...buildVisitGrid(visits, range),
        ...buildDeliveryCells(episode, range.timeZone),
        readPostnatalDate(episode, 'KF1', range.timeZone),
        readPostnatalDate(episode, 'KF2', range.timeZone),
        readPostnatalDate(episode, 'KF3', range.timeZone),
        readPostnatalDate(episode, 'KF4', range.timeZone),
        episode.postpartumFamilyPlanningMethod === null
          ? NOT_RECORDED
          : MATERNAL_REPORT_LABELS.contraceptiveMethod[episode.postpartumFamilyPlanningMethod],
        postnatalNotes.join('; '),
        NOT_RECORDED,
      ],
    };
  });
}
