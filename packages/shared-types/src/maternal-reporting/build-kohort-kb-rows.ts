import { computeAgeLabel } from '#maternal-reporting/compute-age-label';
import { formatMaternalReportDate } from '#maternal-reporting/format-maternal-report-date';
import { isDateWithinMaternalReportMonth } from '#maternal-reporting/is-date-within-maternal-report-month';
import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type {
  KohortRegisterRow,
  MaternalReportFamilyPlanningSource,
  MaternalReportMonthRange,
} from '#maternal-reporting/types';

const NOT_RECORDED = MATERNAL_REPORT_LABELS.empty;

function formatDay(dateOnly: Date | null): string {
  return dateOnly === null ? NOT_RECORDED : formatMaternalReportDate(dateOnly, 'UTC');
}

function describeReason(reason: string | null): string {
  if (reason === null) {
    return NOT_RECORDED;
  }
  const labels: Record<string, string> = MATERNAL_REPORT_LABELS.discontinuationReason;
  return labels[reason] ?? reason;
}

/**
 * One **provisional** kohort KB row per course live in the month, in
 * `KOHORT_KB_COLUMNS` order (P25-T15, D-040). "Pelayanan bulan ini" lists the
 * services served inside the month as `date: action`; the start itself is
 * listed when it falls in the month, so a new acceptor's row is never empty.
 */
export function buildKohortKbRows(
  courses: readonly MaternalReportFamilyPlanningSource[],
  range: MaternalReportMonthRange,
): KohortRegisterRow[] {
  return courses.map((course, index) => {
    const startedThisMonth = isDateWithinMaternalReportMonth(course.startedOn, range);
    const services = course.services
      .filter((service) => isDateWithinMaternalReportMonth(service.servedOn, range))
      .map((service) => `${formatDay(service.servedOn)}: ${service.action}`);
    const thisMonth = [
      ...(startedThisMonth
        ? [
            `${formatDay(course.startedOn)}: Mulai ${MATERNAL_REPORT_LABELS.contraceptiveMethod[course.method]}`,
          ]
        : []),
      ...services,
    ];
    return {
      id: course.id,
      villageCode: course.patient.villageCode,
      villageName: course.patient.villageName,
      values: [
        String(index + 1),
        course.patient.fullName,
        course.patient.nikLast4 === null ? NOT_RECORDED : `****${course.patient.nikLast4}`,
        computeAgeLabel(course.patient.dateOfBirth, range.startInclusive),
        course.patient.villageName ?? course.patient.address,
        MATERNAL_REPORT_LABELS.contraceptiveMethod[course.method],
        MATERNAL_REPORT_LABELS.acceptorType[course.acceptorType],
        formatDay(course.startedOn),
        course.isPostpartum ? MATERNAL_REPORT_LABELS.yes : MATERNAL_REPORT_LABELS.no,
        course.providerName,
        thisMonth.join('; '),
        formatDay(course.nextDueOn),
        course.sideEffects ?? NOT_RECORDED,
        formatDay(course.discontinuedOn),
        describeReason(course.discontinuationReason),
        NOT_RECORDED,
      ],
    };
  });
}
