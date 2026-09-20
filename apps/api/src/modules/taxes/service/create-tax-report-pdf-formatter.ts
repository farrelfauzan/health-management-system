import { TaxReportPdfValueFormatter } from '@hms/shared-types';

const DISPLAY_LOCALE = 'id-ID';
const CURRENCY_PREFIX = 'Rp ';

/**
 * The value formatter the tax report PDF prints with (P27-T12): Indonesian,
 * whole rupiah, and dates in the clinic's timezone. Time is built from parts
 * because `id-ID` writes `11.00`, which reads like an amount beside `Rp`.
 */
export function createTaxReportPdfFormatter(timeZone: string): TaxReportPdfValueFormatter {
  const moneyFormat = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });
  const calendarFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const timeFormat = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  return {
    rupiah: (amount) => `${CURRENCY_PREFIX}${moneyFormat.format(Math.round(amount))}`,
    calendarDate: (date) => calendarFormat.format(new Date(`${date}T00:00:00Z`)),
    period: (period) => monthFormat.format(new Date(`${period}-01T00:00:00Z`)),
    instant: (value) => {
      const instant = new Date(value);
      const parts = timeFormat.formatToParts(instant);
      const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
      const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
      return `${dateFormat.format(instant)}, ${hour}:${minute}`;
    },
  };
}
