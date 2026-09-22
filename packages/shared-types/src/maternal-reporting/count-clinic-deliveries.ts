import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type { MonthlyKiaSource } from '#maternal-reporting/types';

/**
 * Deliveries whose birth instant falls in the month (P25-T15). Every delivery
 * record is attended by a registered clinician — `attendantDoctorId` is not
 * nullable — so this is "persalinan ditolong tenaga kesehatan di klinik"
 * without a second filter. Twins are one delivery.
 */
export function countClinicDeliveries(source: MonthlyKiaSource): number {
  return source.deliveries.filter((delivery) =>
    isWithinMaternalReportMonth(delivery.birthAt, source.range),
  ).length;
}
