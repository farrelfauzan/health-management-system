import { formatMaternalReportDate } from '#maternal-reporting/format-maternal-report-date';
import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type { PostnatalVisitCodeValue } from '#maternal-care/schemas';
import type {
  KohortRegisterRow,
  MaternalReportMonthRange,
  MaternalReportNewbornRegisterSource,
} from '#maternal-reporting/types';

const NOT_RECORDED = MATERNAL_REPORT_LABELS.empty;

function formatDate(instant: Date | null, timeZone: string): string {
  return instant === null ? NOT_RECORDED : formatMaternalReportDate(instant, timeZone);
}

function readNeonatalVisit(
  source: MaternalReportNewbornRegisterSource,
  code: PostnatalVisitCodeValue,
  timeZone: string,
): string {
  const visit = source.postnatalVisits.find(
    (candidate) =>
      candidate.subject === 'NEWBORN' &&
      candidate.newbornCareRecordId === source.newborn.id &&
      candidate.visitCode === code,
  );
  return formatDate(visit?.startedAt ?? null, timeZone);
}

/**
 * One **provisional** kohort bayi row per baby in `KOHORT_BAYI_COLUMNS` order
 * (P25-T15, D-040). A baby not yet registered as a patient prints her mother's
 * name with "bayi Ny." in front and no NIK; a stillborn baby prints her
 * outcome and blank care cells, because nothing after the birth applies.
 */
export function buildKohortBayiRows(
  sources: readonly MaternalReportNewbornRegisterSource[],
  range: MaternalReportMonthRange,
): KohortRegisterRow[] {
  const timeZone = range.timeZone;
  return sources.map((source, index) => ({
    id: source.newborn.id,
    villageCode: source.mother.villageCode,
    villageName: source.mother.villageName,
    values: [
      String(index + 1),
      source.newborn.fullName ?? `Bayi Ny. ${source.mother.fullName}`,
      source.newborn.nikLast4 === null ? NOT_RECORDED : `****${source.newborn.nikLast4}`,
      formatMaternalReportDate(source.birthAt, timeZone),
      MATERNAL_REPORT_LABELS.sex[source.newborn.sex],
      source.mother.fullName,
      source.mother.villageName ?? source.mother.address,
      source.newborn.birthWeightGrams === null
        ? NOT_RECORDED
        : String(source.newborn.birthWeightGrams),
      source.newborn.lengthCm === null ? NOT_RECORDED : String(source.newborn.lengthCm),
      MATERNAL_REPORT_LABELS.birthOutcome[source.newborn.outcome],
      source.newborn.imdStartedAt === null ? MATERNAL_REPORT_LABELS.no : MATERNAL_REPORT_LABELS.yes,
      formatDate(source.newborn.vitaminK1GivenAt, timeZone),
      formatDate(source.newborn.eyeProphylaxisGivenAt, timeZone),
      formatDate(source.newborn.hb0GivenAt, timeZone),
      readNeonatalVisit(source, 'KN1', timeZone),
      readNeonatalVisit(source, 'KN2', timeZone),
      readNeonatalVisit(source, 'KN3', timeZone),
      formatDate(source.newborn.shkSampleTakenAt, timeZone),
      source.newborn.shkResult === null
        ? NOT_RECORDED
        : MATERNAL_REPORT_LABELS.shkResult[source.newborn.shkResult],
      NOT_RECORDED,
    ],
  }));
}
