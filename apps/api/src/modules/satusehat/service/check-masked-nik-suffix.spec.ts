import { checkMaskedNikSuffix } from './check-masked-nik-suffix';

describe('checkMaskedNikSuffix', () => {
  const STORED_NIK = '3313096403900009';

  it('matches when the visible digits agree, in the mask the platform returns', () => {
    expect(checkMaskedNikSuffix({ maskedNik: '*************009', storedNik: STORED_NIK })).toBe(
      'MATCHES',
    );
  });

  it('differs when any visible digit disagrees — a different person', () => {
    expect(checkMaskedNikSuffix({ maskedNik: '*************019', storedNik: STORED_NIK })).toBe(
      'DIFFERS',
    );
  });

  it('reads visible digits by position, not by a fixed suffix length', () => {
    expect(checkMaskedNikSuffix({ maskedNik: '3313********0009', storedNik: STORED_NIK })).toBe(
      'MATCHES',
    );
  });

  it.each([
    ['no NIK on SATUSEHAT', null, STORED_NIK],
    ['no NIK stored locally', '*************009', null],
    ['a value of another length', '*****009', STORED_NIK],
    ['nothing visible', '****************', STORED_NIK],
  ])('is unavailable with %s', (_label, maskedNik, storedNik) => {
    expect(checkMaskedNikSuffix({ maskedNik, storedNik })).toBe('UNAVAILABLE');
  });
});
