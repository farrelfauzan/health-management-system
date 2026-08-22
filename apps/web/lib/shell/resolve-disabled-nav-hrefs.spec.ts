import { describe, expect, it } from 'vitest';

import { resolveDisabledNavHrefs } from './resolve-disabled-nav-hrefs';

describe('resolveDisabledNavHrefs', () => {
  it('hides nothing when the claims carry no feature information', () => {
    expect(resolveDisabledNavHrefs({ roles: ['ADMIN'] })).toEqual([]);
  });

  it('hides nothing for a null claim set', () => {
    expect(resolveDisabledNavHrefs(null)).toEqual([]);
  });

  it('returns every route a disabled feature owns', () => {
    const actual = resolveDisabledNavHrefs({ disabledFeatures: ['ai-chatbot'] });

    expect(actual).toEqual(
      expect.arrayContaining([
        '/admin/ai-assistant',
        '/admin/ai-providers',
        '/doctor/ai-assistant',
      ]),
    );
  });

  it('leaves an enabled feature route alone', () => {
    const actual = resolveDisabledNavHrefs({ disabledFeatures: ['ai-chatbot'] });

    expect(actual).not.toContain('/admin/pharmacy');
  });

  it('ignores a key the catalog does not know', () => {
    // An API newer than this bundle may name a feature whose routes do not
    // exist here yet. Hiding nothing is the right answer to that.
    expect(resolveDisabledNavHrefs({ disabledFeatures: ['warp-drive'] })).toEqual([]);
  });

  it('keeps a shared route while any owner is still enabled', () => {
    // `/admin/integrations` is listed by bpjs-pcare, bpjs-antrean and
    // satusehat. A clinic that bought two of the three must keep the screen.
    const actual = resolveDisabledNavHrefs({ disabledFeatures: ['satusehat'] });

    expect(actual).not.toContain('/admin/integrations');
  });

  it('hides a shared route once every owner is disabled', () => {
    const actual = resolveDisabledNavHrefs({
      disabledFeatures: ['satusehat', 'bpjs-pcare', 'bpjs-antrean'],
    });

    expect(actual).toContain('/admin/integrations');
  });

  it('combines the routes of several disabled features', () => {
    const actual = resolveDisabledNavHrefs({ disabledFeatures: ['pharmacy', 'billing'] });

    expect(actual).toEqual(expect.arrayContaining(['/admin/pharmacy', '/admin/billing']));
  });
});
