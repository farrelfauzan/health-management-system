import { TaxCodeCatalog, TaxCodeRecord } from '@hms/shared-types';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { TaxAssignmentRepository } from '../repository/tax-assignment.repository';
import { InvoiceTaxService } from './invoice-tax.service';
import { TaxCodeService } from './tax-code.service';
import { TaxProfileService } from './tax-profile.service';

const BARANG_PPN: TaxCodeRecord = {
  id: 'code-barang',
  code: 'BARANG-PPN',
  name: 'Barang kena pajak',
  ppnTreatment: 'STANDARD',
  fakturTransactionCode: '04',
  invoiceNote: null,
  coretaxItemCode: null,
  coretaxUnitCode: null,
  coretaxAdditionalInfo: null,
  coretaxFacilityStamp: null,
  isSystem: true,
  isActive: true,
  rates: [
    {
      id: 'r1',
      ratePercent: 12,
      dppNumerator: 11,
      dppDenominator: 12,
      effectiveFrom: '2025-01-01',
    },
  ],
};
const JASA_MEDIS: TaxCodeRecord = {
  ...BARANG_PPN,
  id: 'code-jasa',
  code: 'JASA-MEDIS',
  ppnTreatment: 'EXEMPT_MEDICAL',
  fakturTransactionCode: '08',
  rates: [],
};
const NONMEDIS: TaxCodeRecord = { ...BARANG_PPN, id: 'code-nonmedis', code: 'JASA-NONMEDIS-PPN' };

describe('InvoiceTaxService', () => {
  const catalog: TaxCodeCatalog = {
    codesById: new Map([BARANG_PPN, JASA_MEDIS, NONMEDIS].map((code) => [code.id, code])),
    defaultCodeIdByTarget: new Map([
      ['CONSULTATION', JASA_MEDIS.id],
      ['OTHER', JASA_MEDIS.id],
      ['MEDICATION', BARANG_PPN.id],
    ]),
  };
  const taxCodeServiceMock = { getTaxCodeCatalog: jest.fn().mockResolvedValue(catalog) };
  const taxProfileServiceMock = { getTaxSettings: jest.fn() };
  const taxAssignmentRepositoryMock = { findTaxCodeOverrides: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn() };

  const service = new InvoiceTaxService(
    taxCodeServiceMock as unknown as TaxCodeService,
    taxProfileServiceMock as unknown as TaxProfileService,
    taxAssignmentRepositoryMock as unknown as TaxAssignmentRepository,
    featureAvailabilityCacheMock as unknown as FeatureAvailabilityCacheService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({ isPkp: true });
    taxAssignmentRepositoryMock.findTaxCodeOverrides.mockResolvedValue({
      byServiceTariffId: new Map([['tariff-facial', NONMEDIS.id]]),
      byMedicationId: new Map(),
    });
  });

  it('taxes each line under its override, else its item-type default, and sums the PPN', async () => {
    const actual = await service.computeLineTaxes({
      onDate: '2026-09-19',
      lines: [
        { itemType: 'CONSULTATION', serviceTariffId: 'tariff-consult', amount: 150_000 },
        { itemType: 'OTHER', serviceTariffId: 'tariff-facial', amount: 222_000 },
        { itemType: 'MEDICATION', medicationId: 'med-amox', amount: 111_000 },
      ],
    });

    expect(actual.lines.map((line) => [line.tax.taxCode, line.tax.taxAmount])).toEqual([
      ['JASA-MEDIS', 0],
      ['JASA-NONMEDIS-PPN', 22_000],
      ['BARANG-PPN', 11_000],
    ]);
    expect(actual.taxAmount).toBe(33_000);
  });

  it('marks a line unresolved when its item type has no default', async () => {
    const actual = await service.computeLineTaxes({
      onDate: '2026-09-19',
      lines: [{ itemType: 'LAB', serviceTariffId: 'tariff-lab', amount: 50_000 }],
    });

    expect(actual.lines[0]?.tax.isResolved).toBe(false);
  });

  it('taxes nothing and refuses nothing while the taxes feature is off', async () => {
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(false);

    const actual = await service.computeLineTaxes({
      onDate: '2026-09-19',
      lines: [{ itemType: 'LAB', amount: 50_000 }],
    });

    expect(actual.lines[0]?.tax).toMatchObject({ taxCode: null, taxAmount: 0, isResolved: true });
    expect(taxCodeServiceMock.getTaxCodeCatalog).not.toHaveBeenCalled();
  });
});
