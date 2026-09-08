const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

const TWO_DIGITS = 2;

type FormatIndonesianDateTimeParams = {
  readonly value: Date;
  /** The clinic's zone: a report released at 23:30 in Jakarta is dated that day, not tomorrow. */
  readonly timeZone: string;
  readonly withTime: boolean;
};

/**
 * "7 September 2026" or "7 September 2026, 11:40", in the clinic's time zone
 * (P18-T05). The surat pengantar formats its dates in UTC because a date of
 * birth has no zone; a release has one, and printing it an hour off is how a
 * patient ends up disputing which report came first.
 */
export function formatIndonesianDateTime(params: FormatIndonesianDateTimeParams): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: params.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(params.value);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const monthIndex = Number(read('month')) - 1;
  const date = `${Number(read('day'))} ${INDONESIAN_MONTHS[monthIndex] ?? ''} ${read('year')}`;
  if (!params.withTime) {
    return date;
  }
  const hour = read('hour').padStart(TWO_DIGITS, '0').replace('24', '00');
  const minute = read('minute').padStart(TWO_DIGITS, '0');
  return `${date}, ${hour}:${minute}`;
}
