import { TaxAssignmentTargetRecord, TaxCodeCatalog, TaxCodeRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxAssignmentRepository } from '../../tax-core/repository/tax-assignment.repository';
import { TaxAssignmentService } from './tax-assignment.service';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';

const JASA_MEDIS: TaxCodeRecord = {
  id: 'code-jasa',
  code: 'JASA-MEDIS',
  name: 'Jasa medis',
  ppnTreatment: 'EXEMPT_MEDICAL',
  fakturTransactionCode: '08',
  invoiceNote: null,
  coretaxItemCode: null,
  coretaxUnitCode: null,
  coretaxAdditionalInfo: null,
  coretaxFacilityStamp: null,
  isSystem: true,
  isActive: true,
  rates: [],
};
const NONMEDIS: TaxCodeRecord = {
  ...JASA_MEDIS,
  id: 'code-nonmedis',
  code: 'JASA-NONMEDIS-PPN',
  ppnTreatment: 'STANDARD',
  fakturTransactionCode: '04',
};

function buildTarget(overrides: Partial<TaxAssignmentTargetRecord>): TaxAssignmentTargetRecord {
  return {
    kind: 'SERVICE_TARIFF',
    id: 'tariff-1',
    code: 'KONSULTASI-UMUM',
    name: 'Konsultasi Dokter Umum',
    category: 'CONSULTATION',
    price: 50000,
    taxCodeId: null,
    coretaxItemCode: null,
    coretaxUnitCode: null,
    ...overrides,
  };
}

describe('TaxAssignmentService', () => {
  const taxAssignmentRepositoryMock = {
    listActiveAssignmentTargets: jest.fn(),
    findExistingTargetIds: jest.fn(),
    assignTaxCode: jest.fn(),
    assignCoretaxCodes: jest.fn(),
  };
  const taxCodeServiceMock = { getTaxCodeCatalog: jest.fn(), getActiveTaxCode: jest.fn() };
  const auditServiceMock = { record: jest.fn() };

  const service = new TaxAssignmentService(
    taxAssignmentRepositoryMock as unknown as TaxAssignmentRepository,
    taxCodeServiceMock as unknown as TaxCodeService,
    auditServiceMock as unknown as AuditService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;
  const catalog: TaxCodeCatalog = {
    codesById: new Map([
      [JASA_MEDIS.id, JASA_MEDIS],
      [NONMEDIS.id, NONMEDIS],
    ]),
    defaultCodeIdByTarget: new Map([['CONSULTATION', JASA_MEDIS.id]]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    taxCodeServiceMock.getTaxCodeCatalog.mockResolvedValue(catalog);
  });

  it('resolves each item and counts the unresolved across every page', async () => {
    taxAssignmentRepositoryMock.listActiveAssignmentTargets.mockResolvedValue([
      buildTarget({}),
      buildTarget({ id: 'tariff-2', name: 'Facial', category: 'OTHER', taxCodeId: NONMEDIS.id }),
      buildTarget({ id: 'med-1', kind: 'MEDICATION', name: 'Amoxicillin', category: 'OBAT_KERAS' }),
    ]);

    const actual = await service.listAssignments({ page: 1, limit: 1 });

    expect(actual.meta).toEqual({ page: 1, limit: 1, total: 3, unresolvedCount: 1 });
    expect(actual.items[0]).toMatchObject({
      source: 'CATEGORY_DEFAULT',
      effectiveTaxCode: { code: 'JASA-MEDIS' },
    });
  });

  it('filters to the unresolved items', async () => {
    taxAssignmentRepositoryMock.listActiveAssignmentTargets.mockResolvedValue([
      buildTarget({}),
      buildTarget({ id: 'med-1', kind: 'MEDICATION', name: 'Amoxicillin', category: null }),
    ]);

    const actual = await service.listAssignments({ page: 1, limit: 20, source: 'UNRESOLVED' });

    expect(actual.items.map((item) => item.id)).toEqual(['med-1']);
  });

  it('applies a code to 12 tariffs in one call and writes one audit row, the ticket example', async () => {
    const targets = Array.from({ length: 12 }, (_, index) => ({
      kind: 'SERVICE_TARIFF' as const,
      id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    }));
    taxCodeServiceMock.getActiveTaxCode.mockResolvedValue(NONMEDIS);
    taxAssignmentRepositoryMock.findExistingTargetIds.mockResolvedValue(targets.map((t) => t.id));
    taxAssignmentRepositoryMock.assignTaxCode.mockResolvedValue(12);

    const actual = await service.bulkAssign({ targets, taxCodeId: NONMEDIS.id }, actor);

    expect(actual).toEqual({ updatedCount: 12 });
    expect(taxAssignmentRepositoryMock.assignTaxCode).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TAX_ASSIGNMENT_CHANGED',
        metadata: expect.objectContaining({ code: 'JASA-NONMEDIS-PPN', updatedCount: 12 }),
      }),
    );
  });

  it('refuses the whole batch when a target no longer exists', async () => {
    taxAssignmentRepositoryMock.findExistingTargetIds.mockResolvedValue([]);

    await expect(
      service.bulkAssign({ targets: [{ kind: 'MEDICATION', id: 'gone' }], taxCodeId: null }, actor),
    ).rejects.toMatchObject({ response: { code: 'TAX_ASSIGNMENT_TARGET_NOT_FOUND' } });
    expect(taxAssignmentRepositoryMock.assignTaxCode).not.toHaveBeenCalled();
  });

  it("shows the item's own Coretax codes over its tax code's, and flags the override (P27-T09)", async () => {
    const catalogWithCodes: TaxCodeCatalog = {
      ...catalog,
      codesById: new Map([
        [JASA_MEDIS.id, { ...JASA_MEDIS, coretaxItemCode: '000000', coretaxUnitCode: 'UM.0030' }],
      ]),
    };
    taxCodeServiceMock.getTaxCodeCatalog.mockResolvedValue(catalogWithCodes);
    taxAssignmentRepositoryMock.listActiveAssignmentTargets.mockResolvedValue([
      buildTarget({}),
      buildTarget({ id: 'tariff-2', coretaxUnitCode: 'UM.0027' }),
    ]);

    const actual = await service.listAssignments({ page: 1, limit: 20 });

    expect(
      actual.items.map((row) => [row.coretaxItemCode, row.coretaxUnitCode, row.hasCoretaxOverride]),
    ).toEqual([
      ['000000', 'UM.0030', false],
      ['000000', 'UM.0027', true],
    ]);
  });

  it('sets Coretax codes on existing targets and audits once (P27-T09)', async () => {
    taxAssignmentRepositoryMock.findExistingTargetIds.mockResolvedValue(['med-1']);
    taxAssignmentRepositoryMock.assignCoretaxCodes.mockResolvedValue(1);

    const actual = await service.bulkAssignCoretaxCodes(
      {
        targets: [{ kind: 'MEDICATION', id: 'med-1' }],
        coretaxItemCode: '000000',
        coretaxUnitCode: 'UM.0022',
      },
      actor,
    );

    expect(actual).toEqual({ updatedCount: 1 });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TAX_ASSIGNMENT_CHANGED',
        metadata: expect.objectContaining({ coretaxItemCode: '000000', updatedCount: 1 }),
      }),
    );
  });
});
