import { CoretaxFakturSourceInvoice, TaxReportRecord, TaxSettingsRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { CoretaxFakturSourceRepository } from '../repository/coretax-faktur-source.repository';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { CoretaxFakturExportService } from './coretax-faktur-export.service';

const REPORT_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const PATIENT_NIK = '3171000000000001';
const ACTOR = { sub: 'admin-user' } as CurrentUser;

function buildReport(overrides: Partial<TaxReportRecord> = {}): TaxReportRecord {
  return {
    id: REPORT_ID,
    period: '2026-10',
    kind: 'PPN_OUTPUT',
    status: 'FINALIZED',
    summary: {
      kind: 'PPN_OUTPUT',
      invoiceCount: 2,
      groups: [],
      legacyLineCount: 0,
      legacyAmount: 0,
      notObjectLineCount: 0,
      notObjectAmount: 0,
      totals: { taxableAmount: 50000, taxBase: 45833, taxAmount: 5500 },
      paymentDueDate: '2026-11-30',
      reportingDueDate: '2026-11-30',
    },
    lines: [
      {
        invoiceId: 'invoice-1',
        invoiceNumber: 'INV-202610-0001',
        issuedAt: '2026-10-05T03:00:00.000Z',
        fakturTransactionCode: '04',
        lineCount: 1,
        taxableAmount: 50000,
        taxBase: 45833,
        taxAmount: 5500,
      },
      {
        invoiceId: 'invoice-2',
        invoiceNumber: 'INV-202610-0002',
        issuedAt: '2026-10-06T03:00:00.000Z',
        fakturTransactionCode: '04',
        lineCount: 1,
        taxableAmount: 10000,
        taxBase: 9167,
        taxAmount: 1100,
      },
    ],
    generatedAt: new Date('2026-11-02T02:00:00.000Z'),
    generatedById: 'admin-user',
    finalizedAt: new Date('2026-11-02T02:00:00.000Z'),
    finalizedById: 'admin-user',
    ...overrides,
  };
}

function buildInvoice(overrides: Partial<CoretaxFakturSourceInvoice>): CoretaxFakturSourceInvoice {
  return {
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV-202610-0001',
    issuedAt: new Date('2026-10-05T03:00:00.000Z'),
    buyerName: 'Budi Santoso',
    buyerAddress: 'Jl. Merdeka No. 1, Jakarta',
    buyerNik: PATIENT_NIK,
    lines: [
      {
        itemType: 'MEDICATION',
        description: 'Amoxicillin 500 mg',
        quantity: 10,
        fakturTransactionCode: '04',
        taxableAmount: 50000,
        taxBase: 45833,
        taxRatePercent: 12,
        taxAmount: 5500,
        coretaxItemCode: '000000',
        coretaxUnitCode: 'UM.0021',
        coretaxAdditionalInfo: null,
        coretaxFacilityStamp: null,
      },
    ],
    ...overrides,
  };
}

describe('CoretaxFakturExportService (P27-T09)', () => {
  const taxReportRepositoryMock = { findReportById: jest.fn() };
  const coretaxFakturSourceRepositoryMock = { findInvoices: jest.fn() };
  const clinicProfileServiceMock = { getTaxId: jest.fn() };
  const taxProfileServiceMock = { getTaxSettings: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };
  const service = new CoretaxFakturExportService(
    taxReportRepositoryMock as unknown as TaxReportRepository,
    coretaxFakturSourceRepositoryMock as unknown as CoretaxFakturSourceRepository,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    taxProfileServiceMock as unknown as TaxProfileService,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    clinicProfileServiceMock.getTaxId.mockResolvedValue('00.123.456.7-890.1000');
    taxProfileServiceMock.getTaxSettings.mockResolvedValue({
      nitku: '0012345678901000000000',
    } as TaxSettingsRecord);
    coretaxFakturSourceRepositoryMock.findInvoices.mockResolvedValue([
      buildInvoice({}),
      buildInvoice({ invoiceId: 'invoice-2', invoiceNumber: 'INV-202610-0002', buyerNik: null }),
    ]);
  });

  it('reads the invoices the frozen report lists, once each', async () => {
    await service.validateExport(REPORT_ID);
    expect(coretaxFakturSourceRepositoryMock.findInvoices).toHaveBeenCalledWith([
      'invoice-1',
      'invoice-2',
    ]);
  });

  it('refuses a draft and a report of another kind', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValueOnce(buildReport({ status: 'DRAFT' }));
    await expect(service.validateExport(REPORT_ID)).rejects.toBeInstanceOf(ConflictException);
    taxReportRepositoryMock.findReportById.mockResolvedValueOnce(
      buildReport({ kind: 'PPH21_NON_EMPLOYEE' }),
    );
    await expect(service.validateExport(REPORT_ID)).rejects.toMatchObject({
      response: { code: 'TAX_REPORT_NOT_APPLICABLE' },
    });
  });

  it('counts a patient without NIK as digunggung and validates without auditing', async () => {
    const actual = await service.validateExport(REPORT_ID);
    expect(actual).toMatchObject({ isExportable: true, fakturCount: 1, digunggungCount: 1 });
    expect(actual.template.version).toBe('V1_6');
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('answers 422 with the invoice when a line lacks its item code', async () => {
    coretaxFakturSourceRepositoryMock.findInvoices.mockResolvedValue([
      buildInvoice({
        lines: [{ ...buildInvoice({}).lines[0]!, coretaxItemCode: null }],
      }),
    ]);
    const actual = service.exportXml({ id: REPORT_ID, actor: ACTOR });
    await expect(actual).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(actual).rejects.toMatchObject({
      response: {
        code: 'CORETAX_EXPORT_INVALID',
        details: [expect.objectContaining({ code: 'ITEM_CODE_MISSING', subjectId: 'invoice-1' })],
      },
    });
  });

  it('exports and audits the export and the NIK unmask without the NIK', async () => {
    const actual = await service.exportXml({ id: REPORT_ID, actor: ACTOR });
    expect(actual.fileName).toBe('coretax-faktur-keluaran-2026-10-v1_6.xml');
    expect(actual.xml).toContain(`<BuyerDocumentNumber>${PATIENT_NIK}</BuyerDocumentNumber>`);
    expect(auditServiceMock.record.mock.calls.map(([entry]) => entry.action)).toEqual([
      'EXPORT',
      'PATIENT_IDENTIFIER_UNMASKED',
    ]);
    expect(JSON.stringify(auditServiceMock.record.mock.calls)).not.toContain(PATIENT_NIK);
  });
});
