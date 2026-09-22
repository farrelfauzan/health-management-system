import { TaxCodeCatalog, TaxCodeRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { TaxAssignmentRepository } from '../../tax-core/repository/tax-assignment.repository';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxPriceBreakdownService } from './tax-price-breakdown.service';

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

describe('TaxPriceBreakdownService (P27-T04)', () => {
  const catalog: TaxCodeCatalog = {
    codesById: new Map([[BARANG_PPN.id, BARANG_PPN]]),
    defaultCodeIdByTarget: new Map([['MEDICATION', BARANG_PPN.id]]),
  };
  const taxAssignmentRepositoryMock = { findAssignmentTargets: jest.fn() };
  const taxCodeServiceMock = { getTaxCodeCatalog: jest.fn().mockResolvedValue(catalog) };
  const taxProfileServiceMock = { getTaxSettings: jest.fn() };

  const service = new TaxPriceBreakdownService(
    taxAssignmentRepositoryMock as unknown as TaxAssignmentRepository,
    taxCodeServiceMock as unknown as TaxCodeService,
    taxProfileServiceMock as unknown as TaxProfileService,
    { get: jest.fn().mockReturnValue('Asia/Jakarta') } as unknown as ConfigService,
  );

  const medicine = {
    kind: 'MEDICATION' as const,
    id: 'med-1',
    code: 'AMOX',
    name: 'Amoxicillin',
    category: 'OBAT_KERAS',
    price: 111_000,
    taxCodeId: null,
  };

  it('shows the price before PPN and the PPN for a PKP clinic, the ticket example', async () => {
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({ isPkp: true });
    taxAssignmentRepositoryMock.findAssignmentTargets.mockResolvedValue([medicine]);

    const [actual] = await service.listPriceBreakdowns({ kind: 'MEDICATION', ids: ['med-1'] });

    expect(actual).toEqual({
      kind: 'MEDICATION',
      id: 'med-1',
      status: 'TAXED',
      taxCode: 'BARANG-PPN',
      ppnTreatment: 'STANDARD',
      price: 111_000,
      priceBeforeTax: 100_000,
      taxAmount: 11_000,
    });
  });

  it('says NOT_PKP with no PPN for a clinic that is not PKP', async () => {
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({ isPkp: false });
    taxAssignmentRepositoryMock.findAssignmentTargets.mockResolvedValue([medicine]);

    const [actual] = await service.listPriceBreakdowns({ kind: 'MEDICATION', ids: ['med-1'] });

    expect(actual).toMatchObject({ status: 'NOT_PKP', taxAmount: 0 });
  });

  it('says UNPRICED for a medicine without a price', async () => {
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({ isPkp: true });
    taxAssignmentRepositoryMock.findAssignmentTargets.mockResolvedValue([
      { ...medicine, price: null },
    ]);

    const [actual] = await service.listPriceBreakdowns({ kind: 'MEDICATION', ids: ['med-1'] });

    expect(actual?.status).toBe('UNPRICED');
  });
});
