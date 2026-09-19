import { TaxCodeRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxCodeConflictError } from '../repository/tax-code-conflict.error';
import { TaxCodeRepository } from '../repository/tax-code.repository';
import { TaxCodeService } from './tax-code.service';

describe('TaxCodeService', () => {
  const taxCodeRepositoryMock = {
    listTaxCodes: jest.fn(),
    findTaxCodeById: jest.fn(),
    createTaxCode: jest.fn(),
    updateTaxCode: jest.fn(),
    createTaxCodeRate: jest.fn(),
    listTaxCodeUsage: jest.fn(),
    listCategoryDefaults: jest.fn(),
    saveCategoryDefaults: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new TaxCodeService(
    taxCodeRepositoryMock as unknown as TaxCodeRepository,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;

  function buildCode(overrides: Partial<TaxCodeRecord> = {}): TaxCodeRecord {
    return {
      id: 'code-barang',
      code: 'BARANG-PPN',
      name: 'Barang kena pajak',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
      invoiceNote: null,
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
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T03:00:00.000Z'));
    taxCodeRepositoryMock.listTaxCodeUsage.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows 12% x 11/12 as an effective 11% and marks it current', async () => {
    taxCodeRepositoryMock.listTaxCodes.mockResolvedValue([buildCode()]);

    const [actual] = await service.listTaxCodeViews();

    expect(actual?.currentRate).toMatchObject({ ratePercent: 12, effectiveRatePercent: 11 });
  });

  it('refuses a faktur-code change on a system code', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode());

    await expect(
      service.updateTaxCode('code-barang', { fakturTransactionCode: '01' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_CODE_SYSTEM_LOCKED' } });
    expect(taxCodeRepositoryMock.updateTaxCode).not.toHaveBeenCalled();
  });

  it('refuses a faktur code that does not match a clinic code treatment', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode({ isSystem: false }));

    await expect(
      service.updateTaxCode('code-barang', { fakturTransactionCode: '08' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_CODE_FAKTUR_MISMATCH' } });
  });

  it('refuses to deactivate a code a default still points at', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode());
    taxCodeRepositoryMock.listTaxCodeUsage.mockResolvedValue([
      { taxCodeId: 'code-barang', defaultTargets: ['MEDICATION'], overrideCount: 0 },
    ]);

    await expect(
      service.updateTaxCode('code-barang', { isActive: false }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_CODE_IN_USE' } });
  });

  it('lets a system code be renamed, and audits the fields', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode());
    taxCodeRepositoryMock.updateTaxCode.mockResolvedValue(buildCode({ name: 'Obat' }));

    const actual = await service.updateTaxCode('code-barang', { name: 'Obat' }, actor);

    expect(actual.name).toBe('Obat');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TAX_CODE_CHANGED',
        metadata: expect.objectContaining({ operation: 'UPDATE', fields: ['name'] }),
      }),
    );
  });

  it('only appends a rate later than the latest one, and only on a taxed code', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode());
    const rate = {
      ratePercent: 12,
      dppNumerator: 11,
      dppDenominator: 12,
      effectiveFrom: '2025-01-01',
    };

    await expect(service.addTaxCodeRate('code-barang', rate, actor)).rejects.toMatchObject({
      response: { code: 'TAX_RATE_NOT_AFTER_LATEST' },
    });
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(
      buildCode({ ppnTreatment: 'EXEMPT_MEDICAL', fakturTransactionCode: '08', rates: [] }),
    );
    await expect(
      service.addTaxCodeRate('code-barang', { ...rate, effectiveFrom: '2027-01-01' }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_RATE_NOT_APPLICABLE' } });
  });

  it('answers 409 TAX_CODE_CONFLICT for a duplicate code', async () => {
    taxCodeRepositoryMock.createTaxCode.mockRejectedValue(new TaxCodeConflictError());

    await expect(
      service.createTaxCode(
        {
          code: 'BARANG-PPN',
          name: 'Dup',
          ppnTreatment: 'NOT_OBJECT',
          fakturTransactionCode: null,
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'TAX_CODE_CONFLICT' } });
  });

  it('refuses an inactive code as a category default', async () => {
    taxCodeRepositoryMock.findTaxCodeById.mockResolvedValue(buildCode({ isActive: false }));

    await expect(
      service.updateCategoryDefaults(
        { defaults: [{ target: 'OTHER', taxCodeId: 'code-barang' }] },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'TAX_CODE_INACTIVE' } });
    expect(taxCodeRepositoryMock.saveCategoryDefaults).not.toHaveBeenCalled();
  });
});
