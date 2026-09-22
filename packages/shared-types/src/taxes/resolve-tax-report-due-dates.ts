import type { TaxReportKindValue } from '#taxes/schemas';
import type { TaxReportDueDates } from '#taxes/types';

const PPH_PAYMENT_DAY = 15;
/** SPT Masa PPh 21/26 is filed by the 20th of the following month (P27-T07). */
const PPH21_REPORTING_DAY = 20;

/**
 * When a month's tax is paid and reported (PMK 81/2024 Pasal 94; P27-T05).
 * PPh final is paid by the 15th of the next month, and a validated NTPN
 * counts as the report. Withheld PPh 21 is deposited by the 15th and its SPT
 * Masa filed by the 20th (P27-T07). PPN is paid and its SPT Masa filed by the
 * end of the next month. A due date on a weekend or holiday moves to the next
 * working day under the rules; that shift is not modelled here.
 */
export function resolveTaxReportDueDates(
  period: string,
  kind: TaxReportKindValue,
): TaxReportDueDates {
  const [yearPart = '0', monthPart = '1'] = period.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (kind === 'PP55_OMZET') {
    const due = `${nextYear}-${pad(nextMonth)}-${pad(PPH_PAYMENT_DAY)}`;
    return { paymentDueDate: due, reportingDueDate: due };
  }
  if (kind === 'PPH21_NON_EMPLOYEE') {
    return {
      paymentDueDate: `${nextYear}-${pad(nextMonth)}-${pad(PPH_PAYMENT_DAY)}`,
      reportingDueDate: `${nextYear}-${pad(nextMonth)}-${pad(PPH21_REPORTING_DAY)}`,
    };
  }
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const due = `${nextYear}-${pad(nextMonth)}-${pad(lastDay)}`;
  return { paymentDueDate: due, reportingDueDate: due };
}
