/**
 * The submission monitor's `?provider=` slugs (SJ-162). Its own key, not
 * `tab`, because the monitor sits inside the integrations page's own strip
 * (`?tab=monitor`) and the two must compose in one URL.
 */
export const SUBMISSION_MONITOR_PROVIDERS = ['bpjs', 'satusehat'] as const;

export type SubmissionMonitorProvider = (typeof SUBMISSION_MONITOR_PROVIDERS)[number];
