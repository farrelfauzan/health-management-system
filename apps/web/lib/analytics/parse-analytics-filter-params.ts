import { parseCalendarDate } from '@hms/shared-types';

import {
  ANALYTICS_PERIOD_PRESETS,
  type AnalyticsFilterState,
  type AnalyticsPeriodPreset,
} from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';

export const DEFAULT_ANALYTICS_PRESET: AnalyticsPeriodPreset = 'this-month';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParamValue = string | string[] | undefined;

function readParam(
  params: Readonly<Record<string, SearchParamValue>>,
  name: string,
): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

function readPreset(value: string | undefined): AnalyticsPeriodPreset {
  return ANALYTICS_PERIOD_PRESETS.find((preset) => preset === value) ?? DEFAULT_ANALYTICS_PRESET;
}

function readUuid(value: string | undefined): string | undefined {
  return value !== undefined && UUID_PATTERN.test(value) ? value : undefined;
}

/**
 * Reads a dashboard's filter from its URL, so a shared link or a reload shows
 * the same view. Anything unreadable falls back to this month rather than an
 * error page: a link someone pasted wrong should still open the dashboard.
 * A custom range keeps its dates even when too long, so the filter bar can
 * say why instead of silently shortening it.
 */
export function parseAnalyticsFilterParams(
  params: Readonly<Record<string, SearchParamValue>>,
  today: string,
): AnalyticsFilterState {
  const preset = readPreset(readParam(params, 'period'));
  const from = readParam(params, 'from') ?? '';
  const to = readParam(params, 'to') ?? '';
  const hasCustomDates = parseCalendarDate(from) !== null && parseCalendarDate(to) !== null;
  const range =
    preset === 'custom' && hasCustomDates
      ? { from, to }
      : resolveAnalyticsPresetRange(preset === 'custom' ? DEFAULT_ANALYTICS_PRESET : preset, today);
  return {
    preset: preset === 'custom' && !hasCustomDates ? DEFAULT_ANALYTICS_PRESET : preset,
    from: range?.from ?? today,
    to: range?.to ?? today,
    compare: readParam(params, 'compare') !== 'false',
    specialtyId: readUuid(readParam(params, 'poli')),
    doctorId: readUuid(readParam(params, 'doctor')),
  };
}
