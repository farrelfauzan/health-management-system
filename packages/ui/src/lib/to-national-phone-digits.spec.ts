import { describe, expect, it } from 'vitest';

import { toNationalPhoneDigits } from './to-national-phone-digits';

describe('toNationalPhoneDigits', () => {
  it.each([
    ['a national number', '08123456789'],
    ['an international number', '+62 812-3456-789'],
    ['a country code without a plus', '62 8123 456789'],
    ['a number already stripped to its national part', '8123456789'],
    ['a double-prefixed paste', '+6208123456789'],
    ['a number in brackets', '(0812) 3456-789'],
  ])('reduces %s to the same national digits', (_label, inputValue) => {
    expect(toNationalPhoneDigits(inputValue, '62')).toBe('8123456789');
  });

  it('drops letters instead of letting them into the field', () => {
    expect(toNationalPhoneDigits('tidak punya', '62')).toBe('');
    expect(toNationalPhoneDigits('0812abc3456', '62')).toBe('8123456');
  });

  it('returns nothing for an empty value', () => {
    expect(toNationalPhoneDigits('', '62')).toBe('');
  });
});
