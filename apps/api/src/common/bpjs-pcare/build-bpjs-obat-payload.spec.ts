import { buildBpjsObatPayload } from './build-bpjs-obat-payload';

describe('buildBpjsObatPayload', () => {
  it('parses the ubiquitous NxM dosing convention into the signa pair', () => {
    const actualPayload = buildBpjsObatPayload({
      noKunjungan: 'K0012',
      kdObat: 'K0001',
      quantity: 10,
      frequency: '3x1',
    });

    expect(actualPayload).toEqual({
      noKunjungan: 'K0012',
      kdObat: 'K0001',
      signa1: 3,
      signa2: 1,
      jmlObat: 10,
    });
  });

  it('accepts spacing and multiplication-sign variants', () => {
    expect(buildBpjsObatPayload({ noKunjungan: 'K', kdObat: 'O', quantity: 1, frequency: '2 X 2' })).toMatchObject(
      { signa1: 2, signa2: 2 },
    );
    expect(buildBpjsObatPayload({ noKunjungan: 'K', kdObat: 'O', quantity: 1, frequency: '1×3' })).toMatchObject(
      { signa1: 1, signa2: 3 },
    );
  });

  it('falls back to 1×1 for unparseable or missing dosing text', () => {
    expect(
      buildBpjsObatPayload({ noKunjungan: 'K', kdObat: 'O', quantity: 5, frequency: 'bila perlu' }),
    ).toMatchObject({ signa1: 1, signa2: 1 });
    expect(
      buildBpjsObatPayload({ noKunjungan: 'K', kdObat: 'O', quantity: 5, frequency: null }),
    ).toMatchObject({ signa1: 1, signa2: 1 });
  });
});
