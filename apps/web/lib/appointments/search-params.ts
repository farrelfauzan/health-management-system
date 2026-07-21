import {
  formatDateParam,
  parseDateParam,
} from '#lib/appointments/week-range';

export type AppointmentsView = 'day' | 'week' | 'month' | 'table';

const APPOINTMENT_VIEWS: AppointmentsView[] = ['day', 'week', 'month', 'table'];

function isAppointmentsView(value: string | undefined): value is AppointmentsView {
  return APPOINTMENT_VIEWS.includes(value as AppointmentsView);
}

export type AppointmentsSearchParams = {
  view: AppointmentsView;
  date: string;
  page: number;
  limit: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return fallback;
  }
  return parsed;
}

export function parseAppointmentsSearchParams(raw: RawSearchParams): AppointmentsSearchParams {
  const rawView = pickFirst(raw.view);
  const rawDate = pickFirst(raw.date);
  const parsedDate = rawDate ? parseDateParam(rawDate) : null;
  return {
    view: isAppointmentsView(rawView) ? rawView : 'week',
    date: formatDateParam(parsedDate ?? new Date()),
    page: parsePositiveInt(pickFirst(raw.page), DEFAULT_PAGE, Number.MAX_SAFE_INTEGER),
    limit: parsePositiveInt(pickFirst(raw.limit), DEFAULT_LIMIT, MAX_LIMIT),
  };
}

export function buildAppointmentsSearchParams(next: AppointmentsSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  params.set('view', next.view);
  params.set('date', next.date);
  params.set('page', String(next.page));
  params.set('limit', String(next.limit));
  return params;
}
