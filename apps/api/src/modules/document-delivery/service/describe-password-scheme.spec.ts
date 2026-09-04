import { DELIVERY_PASSWORD_SOURCES } from '@hms/shared-types';

import { describePasswordScheme } from './describe-password-scheme';

describe('describePasswordScheme', () => {
  it('names the date-of-birth scheme in Indonesian first, with the DDMMYYYY format', () => {
    const actual = describePasswordScheme('DOB_DDMMYYYY');

    expect(actual).toMatch(/^Buka dokumen ini/);
    expect(actual).toContain('tanggal lahir');
    expect(actual).toContain('DDMMYYYY');
    expect(actual).toContain('date of birth');
  });

  it.each(DELIVERY_PASSWORD_SOURCES)(
    'has a sentence for %s that contains no digits a value could hide in',
    (source) => {
      const actual = describePasswordScheme(source);

      // The only digit allowed is the "8 angka" length hint; a date, an MRN or
      // any other value would be a longer run.
      expect(actual).not.toMatch(/\d{2,}/);
    },
  );
});
