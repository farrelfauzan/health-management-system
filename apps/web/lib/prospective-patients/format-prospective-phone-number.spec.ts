import { describe, expect, it } from 'vitest';

import { formatProspectivePhoneNumber } from './format-prospective-phone-number';

describe('formatProspectivePhoneNumber', () => {
  it('puts the plus and a space back on a normalised Indonesian number', () => {
    expect(formatProspectivePhoneNumber('628123456789')).toBe('+62 8123456789');
  });

  it('treats a leading zero as the national prefix', () => {
    expect(formatProspectivePhoneNumber('08123456789')).toBe('+62 8123456789');
  });

  it('keeps another country code as it is', () => {
    expect(formatProspectivePhoneNumber('6591234567')).toBe('+6591234567');
  });

  it('ignores punctuation that slipped past normalisation', () => {
    expect(formatProspectivePhoneNumber('+62 812-3456-789')).toBe('+62 8123456789');
  });

  it('returns a value with no digits untouched rather than inventing a prefix', () => {
    expect(formatProspectivePhoneNumber('unknown')).toBe('unknown');
  });
});
