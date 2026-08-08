import { normalizePhoneNumber } from './normalize-phone-number';

describe('normalizePhoneNumber', () => {
  it.each([
    ['a national number', '081210000001'],
    ['an international number', '+62 812-1000-0001'],
    ['a country code without a plus', '62812 1000 0001'],
    ['a number in brackets', '(0812) 1000-0001'],
  ])('reduces %s to the same canonical digits', (_label, inputPhoneNumber) => {
    // A missed match is not a harmless false negative here: it silently
    // creates a second record for a patient the clinic already knows.
    expect(normalizePhoneNumber(inputPhoneNumber)).toBe('6281210000001');
  });

  it('leaves a foreign number alone rather than assuming Indonesia', () => {
    expect(normalizePhoneNumber('+65 8123 4567')).toBe('6581234567');
  });

  it('returns digits for a value it cannot interpret, so it fails to match rather than mismatching', () => {
    expect(normalizePhoneNumber('tidak punya')).toBe('');
  });
});
