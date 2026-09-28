import {
  BPJS_SUBMISSION_STATUSES,
  BPJS_SUBMISSION_TYPES,
  SATUSEHAT_SUBMISSION_KINDS,
} from '@hms/shared-types';

import type { SubmissionMonitorFilters } from '#lib/integrations/submission-monitor-filters';

type SearchParamReader = {
  get: (name: string) => string | null;
};

function pickAllowed<TValue extends string>(
  value: string | null,
  allowed: readonly TValue[],
): TValue | 'ALL' {
  return allowed.find((candidate) => candidate === value) ?? 'ALL';
}

/**
 * The monitor's opening status, BPJS type and SATUSEHAT kind from its URL
 * (P29-T06), so "Perbaiki" on the reporting status page lands on the failed
 * rows. Anything unknown opens unfiltered, as the monitor always did.
 */
export function parseSubmissionMonitorFilters(params: SearchParamReader): SubmissionMonitorFilters {
  return {
    status: pickAllowed(params.get('status'), BPJS_SUBMISSION_STATUSES),
    type: pickAllowed(params.get('type'), BPJS_SUBMISSION_TYPES),
    kind: pickAllowed(params.get('kind'), SATUSEHAT_SUBMISSION_KINDS),
  };
}
