import { resolveNpwpStatus, resolveTaxIdChange } from '@hms/shared-types';

/**
 * P27-T02, D-038 R8. A new NPWP must be the 16 digits Coretax uses; the value
 * already stored passes however it is punctuated, because the clinic-profile
 * form resends every field on every save.
 */
describe('resolveTaxIdChange', () => {
  it('refuses a new 15-digit NPWP, the ticket example', () => {
    const actual = resolveTaxIdChange({ requested: '01.234.567.8-901.000', stored: null });

    expect(actual.kind).toBe('invalid');
  });

  it('accepts a new 16-digit NPWP and stores digits only', () => {
    const actual = resolveTaxIdChange({ requested: '0012 3456 7890 1000', stored: null });

    expect(actual).toEqual({ kind: 'set', value: '0012345678901000' });
  });

  it('leaves a stored 15-digit NPWP alone when the form sends it back', () => {
    const actual = resolveTaxIdChange({
      requested: '012345678901000',
      stored: '01.234.567.8-901.000',
    });

    expect(actual).toEqual({ kind: 'unchanged' });
  });

  it('clears on null or an empty string, and does nothing when the field is absent', () => {
    expect(resolveTaxIdChange({ requested: null, stored: '0012345678901000' })).toEqual({
      kind: 'cleared',
    });
    expect(resolveTaxIdChange({ requested: ' ', stored: '0012345678901000' })).toEqual({
      kind: 'cleared',
    });
    expect(resolveTaxIdChange({ requested: undefined, stored: '0012345678901000' })).toEqual({
      kind: 'unchanged',
    });
  });

  it('refuses letters', () => {
    expect(resolveTaxIdChange({ requested: 'NPWP-123', stored: null }).kind).toBe('invalid');
  });
});

describe('resolveNpwpStatus', () => {
  it('classifies what a clinic may have stored', () => {
    expect(resolveNpwpStatus(null)).toBe('MISSING');
    expect(resolveNpwpStatus('01.234.567.8-901.000')).toBe('LEGACY_15_DIGIT');
    expect(resolveNpwpStatus('0012345678901000')).toBe('VALID');
    expect(resolveNpwpStatus('12345')).toBe('INVALID');
    expect(resolveNpwpStatus('NPWP menyusul')).toBe('INVALID');
  });
});
