import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const validateMock = vi.fn();
const exportMock = vi.fn();
const saveBlobFileMock = vi.fn();

vi.mock('#lib/api/generated/tax-reports/tax-reports', () => ({
  getTaxReportCoretaxFakturControllerValidateFakturV1QueryKey: (id: string) => [
    'coretax-faktur',
    id,
  ],
  taxReportCoretaxFakturControllerValidateFakturV1: (...args: unknown[]) => validateMock(...args),
  taxReportCoretaxFakturControllerExportFakturV1: (...args: unknown[]) => exportMock(...args),
}));
vi.mock('#lib/shared/save-blob-file', () => ({
  saveBlobFile: (...args: unknown[]) => saveBlobFileMock(...args),
}));

const { TaxReportCoretaxFakturCard } = await import('./tax-report-coretax-faktur-card');

const TEMPLATE = {
  format: 'FAKTUR_KELUARAN',
  version: 'V1_6',
  title: 'Converter Excel to XML Coretax v1.6 (Faktur PK template v.1.6.1, sample XML v.1.4)',
  publishedOn: '2026-01-23',
  sourceUrl: 'https://pajak.go.id/sites/default/files/2026-01/ConverterEfakturCoretax__v1.6.zip',
  catalogueUrl: 'https://www.pajak.go.id/id/node/112031',
  sha256: 'ef5957af98ed06d7aee3c0fed6a67b56fe6f515bf776788194b2acd9a005b791',
};

function mockValidation(overrides: Record<string, unknown>): void {
  validateMock.mockResolvedValue({
    status: 200,
    data: {
      data: {
        reportId: 'report-oct',
        period: '2026-10',
        template: TEMPLATE,
        isExportable: true,
        fakturCount: 3,
        digunggungCount: 1,
        issues: [],
        ...overrides,
      },
    },
  });
}

function renderCard(): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <TaxReportCoretaxFakturCard reportId="report-oct" period="2026-10" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxReportCoretaxFakturCard (P27-T09)', () => {
  beforeEach(() => {
    validateMock.mockReset();
    exportMock.mockReset();
    saveBlobFileMock.mockReset();
  });

  it('lists a line without its item code per invoice and offers no download', async () => {
    mockValidation({
      isExportable: false,
      fakturCount: 0,
      issues: [
        {
          code: 'ITEM_CODE_MISSING',
          field: 'coretaxItemCode',
          message: 'no item code',
          subjectId: 'invoice-1',
          subjectLabel: 'INV-202610-0001',
        },
        { code: 'CLINIC_NITKU_INVALID', field: 'clinicNitku', message: 'NITKU' },
      ],
    });
    renderCard();

    expect(await screen.findByText(/tanpa kode barang\/jasa Coretax/)).toBeInTheDocument();
    expect(screen.getByText('INV-202610-0001')).toBeInTheDocument();
    expect(screen.getByText('Klinik')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unduh XML Coretax' })).toBeDisabled();
  });

  it('downloads the v1.6 file when the report is ready and counts the digunggung invoices', async () => {
    mockValidation({});
    exportMock.mockResolvedValue({ status: 200, data: new Blob(['<TaxInvoiceBulk/>']) });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Unduh XML Coretax' }));

    await waitFor(() => expect(saveBlobFileMock).toHaveBeenCalled());
    expect(exportMock).toHaveBeenCalledWith('report-oct');
    expect(saveBlobFileMock.mock.calls[0]?.[0]).toMatchObject({
      fileName: 'coretax-faktur-keluaran-2026-10-v1_6.xml',
    });
    expect(screen.getByText('3 faktur siap.')).toBeInTheDocument();
    expect(
      screen.getByText('1 invoice dengan pasien tanpa NIK tidak disertakan (digunggung).'),
    ).toBeInTheDocument();
  });
});
