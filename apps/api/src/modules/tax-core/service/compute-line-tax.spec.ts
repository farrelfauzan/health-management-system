import { TaxCodeRateRecord, TaxCodeRecord, computeLineTax } from '@hms/shared-types';

const RATE_12_OF_11_12: TaxCodeRateRecord = {
  id: 'rate-1',
  ratePercent: 12,
  dppNumerator: 11,
  dppDenominator: 12,
  effectiveFrom: '2025-01-01',
};

const BARANG_PPN: TaxCodeRecord = {
  id: 'code-barang',
  code: 'BARANG-PPN',
  name: 'Barang kena pajak',
  ppnTreatment: 'STANDARD',
  fakturTransactionCode: '04',
  invoiceNote: null,
  isSystem: true,
  isActive: true,
  rates: [RATE_12_OF_11_12],
};

const JASA_MEDIS: TaxCodeRecord = {
  ...BARANG_PPN,
  id: 'code-jasa',
  code: 'JASA-MEDIS',
  ppnTreatment: 'EXEMPT_MEDICAL',
  fakturTransactionCode: '08',
  rates: [],
};

/** P27-T04: the PPN carved out of a tax-inclusive line, per D-038. */
describe('computeLineTax', () => {
  it('splits Rp111,000 of medicine into 100,000 before PPN, DPP 91,667 and PPN 11,000', () => {
    const actual = computeLineTax({
      amount: 111_000,
      taxCode: BARANG_PPN,
      rate: RATE_12_OF_11_12,
      isPkp: true,
    });

    expect(actual).toEqual({
      taxCode: 'BARANG-PPN',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
      taxableAmount: 100_000,
      taxBase: 91_667,
      taxRatePercent: 12,
      taxAmount: 11_000,
      isResolved: true,
    });
  });

  it('charges nothing for a clinic that is not PKP but keeps the treatment', () => {
    const actual = computeLineTax({
      amount: 111_000,
      taxCode: BARANG_PPN,
      rate: RATE_12_OF_11_12,
      isPkp: false,
    });

    expect(actual).toMatchObject({ ppnTreatment: 'STANDARD', taxAmount: 0, isResolved: true });
  });

  it('carries no PPN on an exempt medical service, even for a PKP', () => {
    const actual = computeLineTax({
      amount: 150_000,
      taxCode: JASA_MEDIS,
      rate: null,
      isPkp: true,
    });

    expect(actual).toMatchObject({
      fakturTransactionCode: '08',
      taxableAmount: 150_000,
      taxAmount: 0,
      isResolved: true,
    });
  });

  it('is unresolved without a code, or with a taxed code that has no rate yet', () => {
    expect(
      computeLineTax({ amount: 10_000, taxCode: null, rate: null, isPkp: true }).isResolved,
    ).toBe(false);
    expect(
      computeLineTax({ amount: 10_000, taxCode: BARANG_PPN, rate: null, isPkp: true }).isResolved,
    ).toBe(false);
  });

  it('rounds each figure to whole rupiah', () => {
    const actual = computeLineTax({
      amount: 2_500,
      taxCode: BARANG_PPN,
      rate: RATE_12_OF_11_12,
      isPkp: true,
    });

    expect(actual).toMatchObject({ taxableAmount: 2_252, taxBase: 2_064, taxAmount: 248 });
  });
});
