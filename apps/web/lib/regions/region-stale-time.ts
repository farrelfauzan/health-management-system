/**
 * How long a region list stays fresh in the query cache.
 *
 * The Kemendagri administrative hierarchy changes a handful of times a year
 * and the API already answers with a one-day `Cache-Control`, so refetching it
 * while a clerk fills in a form is pure latency. Twelve hours keeps a shift's
 * worth of registrations on one fetch per level, and still picks up a reseeded
 * dataset the next day without anybody restarting the browser.
 */
export const REGION_STALE_TIME_MS: number = 12 * 60 * 60 * 1000;
