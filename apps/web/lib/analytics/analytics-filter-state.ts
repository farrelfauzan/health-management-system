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
};

export type AnalyticsPeriodRange = {
  from: string;
  to: string;
};

/**
 * How a KPI changed against the comparison period. `percent` is a relative
 * change (visits +8,4%); `points` is the difference between two rates
 * (no-show −1,2 poin), because a percentage of a percentage misleads.
 */
export type AnalyticsDeltaKind = 'percent' | 'points';

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
