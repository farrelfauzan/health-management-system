import { TaxReportRecord, TaxSettingsRecord } from '@hms/shared-types';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { ClinicianTaxIdentityRepository } from '../repository/clinician-tax-identity.repository';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { CoretaxBp21ExportService } from './coretax-bp21-export.service';

const REPORT_ID = '7c6b5a4f-3e2d-4c1b-8a09-f8e7d6c5b4a3';
const DOCTOR_ID = '1a2b3c4d-0000-4000-8000-000000000001';
const ACTOR: CurrentUser = { sub: 'admin-user', roles: ['ADMIN'] } as unknown as CurrentUser;

function buildReport(overrides: Partial<TaxReportRecord> = {}): TaxReportRecord {
  return {
    id: REPORT_ID,
    period: '2026-10',
    kind: 'PPH21_NON_EMPLOYEE',
    status: 'FINALIZED',
    summary: {
      kind: 'PPH21_NON_EMPLOYEE',
      dppPercent: 50,
      bracketsEffectiveFrom: '2022-01-01',
      clinicianCount: 1,
      incompleteIdentityCount: 0,
      totals: { grossFee: 12_000_000, taxBase: 6_000_000, taxAmount: 300_000 },
      taxAccountCode: '411121',
      depositTypeCode: '100',
      paymentDueDate: '2026-11-15',
      reportingDueDate: '2026-11-20',
    },
    lines: [
      {
        doctorId: DOCTOR_ID,
        doctorName: 'dr. Sari',
        profession: 'DOCTOR',
        identityStatus: 'NPWP',
        identityMasked: '0987654321098765',
        entryCount: 3,
        lineAmount: 20_000_000,
        grossFee: 12_000_000,
        taxBase: 6_000_000,
        slices: [
          {
            lowerBound: 0,
            upperBound: 60_000_000,
            ratePercent: 5,
            taxableAmount: 6_000_000,
            taxAmount: 300_000,
          },
        ],
        taxAmount: 300_000,
      },
    ],
    generatedAt: new Date('2026-11-02T02:00:00.000Z'),
    generatedById: 'admin-user',
    finalizedAt: new Date('2026-11-02T02:00:00.000Z'),
    finalizedById: 'admin-user',
    ...overrides,
  };
}

describe('CoretaxBp21ExportService (P27-T08)', () => {
  const taxReportRepositoryMock = { findReportById: jest.fn() };
  const clinicianTaxIdentityRepositoryMock = { findCoretaxBp21Sources: jest.fn() };
  const clinicProfileServiceMock = { getTaxId: jest.fn() };
  const taxProfileServiceMock = { getTaxSettings: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const service = new CoretaxBp21ExportService(
    taxReportRepositoryMock as unknown as TaxReportRepository,
    clinicianTaxIdentityRepositoryMock as unknown as ClinicianTaxIdentityRepository,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    taxProfileServiceMock as unknown as TaxProfileService,
    auditServiceMock as unknown as AuditService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    clinicProfileServiceMock.getTaxId.mockResolvedValue('00.123.456.7-890.1000');
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({
      nitku: '0012345678901000000000',
    } as TaxSettingsRecord);
    clinicianTaxIdentityRepositoryMock.findCoretaxBp21Sources.mockResolvedValue([
      { doctorId: DOCTOR_ID, taxIdentityNumber: '0987654321098765', ptkpStatus: 'K_1' },
    ]);
  });

  it('refuses a draft: only a frozen month becomes a BP21 file', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport({ status: 'DRAFT' }));
    await expect(service.validateExport(REPORT_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.exportXml({ id: REPORT_ID, actor: ACTOR })).rejects.toMatchObject({
      response: { code: 'TAX_REPORT_NOT_FINALIZED' },
    });
  });

  it('refuses a report of another kind', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport({ kind: 'PP55_OMZET' }));
    await expect(service.validateExport(REPORT_ID)).rejects.toMatchObject({
      response: { code: 'TAX_REPORT_NOT_APPLICABLE' },
    });
  });

  it('validates without auditing and names the template it checks against', async () => {
    const actual = await service.validateExport(REPORT_ID);
    expect(actual).toMatchObject({ isExportable: true, lineCount: 1, issues: [] });
    expect(actual.template.version).toBe('V4');
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('answers 422 with every problem when the file cannot be made', async () => {
    clinicianTaxIdentityRepositoryMock.findCoretaxBp21Sources.mockResolvedValue([
      { doctorId: DOCTOR_ID, taxIdentityNumber: '0987654321098765', ptkpStatus: null },
    ]);
    const actual = service.exportXml({ id: REPORT_ID, actor: ACTOR });
    await expect(actual).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(actual).rejects.toMatchObject({
      response: {
        code: 'CORETAX_EXPORT_INVALID',
        details: [expect.objectContaining({ code: 'PTKP_STATUS_MISSING', subjectId: DOCTOR_ID })],
      },
    });
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('exports the v4 file and audits the export and the unmask, without the numbers', async () => {
    const actual = await service.exportXml({ id: REPORT_ID, actor: ACTOR });
    expect(actual.fileName).toBe('coretax-bp21-2026-10-v4.xml');
    expect(actual.xml).toContain('<TIN>0012345678901000</TIN>');
    expect(actual.xml).toContain('<CounterpartTin>0987654321098765</CounterpartTin>');
    expect(auditServiceMock.record.mock.calls.map(([entry]) => entry.action)).toEqual([
      'EXPORT',
      'DOCTOR_IDENTIFIER_UNMASKED',
    ]);
    expect(JSON.stringify(auditServiceMock.record.mock.calls)).not.toContain('0987654321098765');
  });
});
