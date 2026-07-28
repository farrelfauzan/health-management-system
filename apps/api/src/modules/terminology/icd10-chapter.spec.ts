import { deriveIcd10Chapter } from '@hms/shared-types';

describe('deriveIcd10Chapter', () => {
  it.each([
    ['A09', 'I'],
    ['B86', 'I'],
    ['D50.9', 'III'],
    ['E11.9', 'IV'],
    ['G43.9', 'VI'],
    ['H10.9', 'VII'],
    ['H66.9', 'VIII'],
    ['I10', 'IX'],
    ['J06.9', 'X'],
    ['K30', 'XI'],
    ['L50.9', 'XII'],
    ['M54.5', 'XIII'],
    ['N39.0', 'XIV'],
    ['R50.9', 'XVIII'],
    ['Z00.0', 'XXI'],
  ])('maps %s to chapter %s', (inputCode, expectedChapter) => {
    expect(deriveIcd10Chapter(inputCode)).toBe(expectedChapter);
  });

  it('splits chapter II from chapter III at the D48/D50 boundary', () => {
    expect(deriveIcd10Chapter('D48')).toBe('II');
    expect(deriveIcd10Chapter('D50')).toBe('III');
  });

  it('splits chapter VII from chapter VIII at the H59/H60 boundary', () => {
    expect(deriveIcd10Chapter('H59')).toBe('VII');
    expect(deriveIcd10Chapter('H60')).toBe('VIII');
  });

  it('normalises case and surrounding whitespace', () => {
    expect(deriveIcd10Chapter('  j06.9 ')).toBe('X');
  });

  it('returns null for codes outside every chapter range', () => {
    expect(deriveIcd10Chapter('U07.1')).toBeNull();
    expect(deriveIcd10Chapter('')).toBeNull();
  });

  it('leaves the gap between chapter II and III unmapped', () => {
    expect(deriveIcd10Chapter('D49')).toBeNull();
  });
});
