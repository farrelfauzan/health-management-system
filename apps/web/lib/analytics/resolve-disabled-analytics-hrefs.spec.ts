import { describe, expect, it } from 'vitest';

import type { AccessTokenClaims } from '#lib/auth/access-token-claims';
import { resolveDisabledAnalyticsHrefs } from '#lib/analytics/resolve-disabled-analytics-hrefs';

function buildClaims(disabledFeatures: string[]): AccessTokenClaims {
  return { disabledFeatures } as unknown as AccessTokenClaims;
}

describe('resolveDisabledAnalyticsHrefs', () => {
  it('hides Farmasi when the pharmacy module is off, and nothing else', () => {
    const actual = resolveDisabledAnalyticsHrefs(buildClaims(['pharmacy']));

    expect(actual).toEqual(['/admin/analytics/pharmacy']);
  });

  it('hides Laboratorium when the laboratory module is off', () => {
    const actual = resolveDisabledAnalyticsHrefs(buildClaims(['laboratory']));

    expect(actual).toEqual(['/admin/analytics/laboratory']);
  });

  it('hides nothing with every module on, or with no feature information at all', () => {
    expect(resolveDisabledAnalyticsHrefs(buildClaims([]))).toEqual([]);
    expect(resolveDisabledAnalyticsHrefs(null)).toEqual([]);
  });
});
