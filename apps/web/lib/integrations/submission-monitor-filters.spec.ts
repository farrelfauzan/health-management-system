import { describe, expect, it } from 'vitest';

import { buildSubmissionMonitorHref } from './build-submission-monitor-href';
import { parseSubmissionMonitorFilters } from './parse-submission-monitor-filters';

describe('submission monitor links', () => {
  it('opens the SATUSEHAT monitor on failed encounter submissions', () => {
    expect(
      buildSubmissionMonitorHref({ provider: 'satusehat', status: 'FAILED', kind: 'ENCOUNTER' }),
    ).toBe('/admin/integrations?tab=monitor&provider=satusehat&status=FAILED&kind=ENCOUNTER');
  });

  it('round-trips a BPJS link into the monitor filters', () => {
    const href = buildSubmissionMonitorHref({ provider: 'bpjs', status: 'FAILED', type: 'OBAT' });

    const actual = parseSubmissionMonitorFilters(new URL(href, 'http://clinic.test').searchParams);

    expect(actual).toEqual({ status: 'FAILED', type: 'OBAT', kind: 'ALL' });
  });

  it('opens unfiltered on values it does not know', () => {
    const actual = parseSubmissionMonitorFilters(
      new URLSearchParams('status=BROKEN&type=X&kind=Y'),
    );

    expect(actual).toEqual({ status: 'ALL', type: 'ALL', kind: 'ALL' });
  });
});
