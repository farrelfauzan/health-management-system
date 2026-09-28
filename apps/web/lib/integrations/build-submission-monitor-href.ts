import type { SubmissionMonitorLinkTarget } from '#lib/integrations/submission-monitor-filters';

/**
 * The integrations page's monitor, opened on one provider and filtered: the
 * link behind every failed count on the reporting status page (PRD FR-INT-03).
 */
export function buildSubmissionMonitorHref({
  provider,
  status,
  type,
  kind,
}: SubmissionMonitorLinkTarget): string {
  const params = new URLSearchParams({ tab: 'monitor', provider, status });
  if (type) {
    params.set('type', type);
  }
  if (kind) {
    params.set('kind', kind);
  }
  return `/admin/integrations?${params.toString()}`;
}
