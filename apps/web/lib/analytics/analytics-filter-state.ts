import type { AnalyticsPayerTypeValue } from '@hms/shared-types';

/** The period chips on every analytics filter bar, in their on-screen order. */
export const ANALYTICS_PERIOD_PRESETS = [
  'today',
  'last-7-days',
  'this-month',
  'last-month',
  'last-3-months',
  'last-12-months',
  'custom',
] as const;

export type AnalyticsPeriodPreset = (typeof ANALYTICS_PERIOD_PRESETS)[number];

/**
 * What an analytics dashboard is showing, as the URL carries it: the period
 * (a preset, or custom dates), whether to compare, and the narrowing filters.
 * Dates are the clinic's local `YYYY-MM-DD`, both ends included.
 */
export type AnalyticsFilterState = {
  preset: AnalyticsPeriodPreset;
  from: string;
  to: string;
  compare: boolean;
  specialtyId?: string;
  doctorId?: string;
  /** Who pays for the visit (P29-T07). */
  payerType?: AnalyticsPayerTypeValue;
};

export type AnalyticsPeriodRange = {
  from: string;
  to: string;
};

/**
 * How a KPI changed against the comparison period. `percent` is a relative
 * change (visits +8,4%); `points` is the difference between two rates
 * (no-show −1,2 poin), because a percentage of a percentage misleads;
 * `minutes` is the difference between two durations (wait +3 mnt);
 * `rupiah` is the difference between two amounts (unpaid +Rp1,4 jt);
 * `invoices` is the difference between two counts of invoices (−2 invoice);
 * `count` is the plain difference between two counts (+6).
 */
export type AnalyticsDeltaKind = 'percent' | 'points' | 'minutes' | 'rupiah' | 'invoices' | 'count';

export type AnalyticsDeltaDirection = 'up' | 'down' | 'flat';

/** Whether the change is good news: fewer no-shows is, fewer visits is not. */
export type AnalyticsDeltaTone = 'good' | 'bad' | 'neutral';

export type AnalyticsDeltaInput = {
  current: number | null;
  previous: number | null;
  kind: AnalyticsDeltaKind;
  higherIsBetter: boolean;
};

export type AnalyticsDelta = {
  kind: AnalyticsDeltaKind;
  direction: AnalyticsDeltaDirection;
  tone: AnalyticsDeltaTone;
  value: number;
};

/** A KPI tile's delta request: the two figures, how to compare them, and what "vs" names. */
export type AnalyticsKpiDeltaInput = Omit<AnalyticsDeltaInput, 'previous'> & {
  previous: number | null | undefined;
  previousLabel: string;
};

/** `isCompact` shortens a million and more ("Rp186,4 jt"); `isSigned` writes "+" too. */
export type FormatRupiahOptions = {
  isCompact?: boolean;
  isSigned?: boolean;
};

/** How long something has waited, split for "2 j 14 mnt" or "3 hari". */
export type ElapsedParts =
  | { unit: 'minutes'; minutes: number }
  | { unit: 'hoursMinutes'; hours: number; minutes: number }
  | { unit: 'days'; days: number };

/** One row of a submission table: counts and, when something failed, where to fix it. */
export type AnalyticsSubmissionTableRow = {
  key: string;
  label: string;
  submitted: number;
  pending: number;
  failed: number;
  fixHref?: string;
};

/** One heatmap cell: its check-ins and a shade from 0 (none) to 4 (busiest). */
export type BusiestHoursGridCell = {
  hour: number;
  checkIns: number;
  shade: number;
};

export type BusiestHoursGrid = {
  hours: number[];
  rows: Array<{ weekday: number; cells: BusiestHoursGridCell[] }>;
  busiest: { weekday: number; hour: number; checkIns: number } | null;
};

/**
 * A colour of one category on a finance chart: the Tailwind class for its
 * legend swatch and the fill recharts paints, with the hex as a fallback.
 */
export type AnalyticsSeriesColor = {
  swatchClassName: string;
  fill: string;
};

/** One slice of a share bar or donut legend: its label and its whole-number share. */
export type AnalyticsShareSegment = {
  key: string;
  label: string;
  value: number;
  percent: number;
  color: AnalyticsSeriesColor;
};
