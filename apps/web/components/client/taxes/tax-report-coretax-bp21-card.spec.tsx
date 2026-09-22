import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const validateMock = vi.fn();
const exportMock = vi.fn();
const saveBlobFileMock = vi.fn();

vi.mock('#lib/api/generated/tax-reports/tax-reports', () => ({
  getTaxReportCoretaxControllerValidateBp21V1QueryKey: (id: string) => ['coretax-bp21', id],
  taxReportCoretaxControllerValidateBp21V1: (...args: unknown[]) => validateMock(...args),
  taxReportCoretaxControllerExportBp21V1: (...args: unknown[]) => exportMock(...args),
}));
vi.mock('#lib/shared/save-blob-file', () => ({
  saveBlobFile: (...args: unknown[]) => saveBlobFileMock(...args),
}));

const { TaxReportCoretaxBp21Card } = await import('./tax-report-coretax-bp21-card');

const TEMPLATE = {
  format: 'BP21',
  version: 'V4',
  title: 'BP21 Excel to XML v.4',
  publishedOn: '2025-04-17',
  sourceUrl: 'https://pajak.go.id/sites/default/files/2025-04/BP21%20Excel%20to%20XML%20v.4.xlsx',
  catalogueUrl: 'https://www.pajak.go.id/id/node/112031',
  sha256: '511bec3d57f61f2273112fdbae66b373be372df12c3ae13146d8373d1ca840cf',
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
        lineCount: 3,
        skippedCount: 0,
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
        <TaxReportCoretaxBp21Card reportId="report-oct" period="2026-10" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxReportCoretaxBp21Card (P27-T08)', () => {
  beforeEach(() => {
    validateMock.mockReset();
    exportMock.mockReset();
    saveBlobFileMock.mockReset();
  });

  it('lists every problem per clinician and offers no download', async () => {
    mockValidation({
      isExportable: false,
      lineCount: 0,
      issues: [
        {
          code: 'PTKP_STATUS_MISSING',
          field: 'ptkpStatus',
          message: 'The BP21 template requires a PTKP status',
          subjectId: 'dr-sari',
          subjectLabel: 'dr. Sari',
        },
        { code: 'CLINIC_NITKU_INVALID', field: 'clinicNitku', message: 'NITKU' },
      ],
    });
    renderCard();

    expect(await screen.findByText(/Status PTKP belum dicatat/)).toBeInTheDocument();
    expect(screen.getByText('dr. Sari')).toBeInTheDocument();
    expect(screen.getByText('Klinik')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unduh XML Coretax' })).toBeDisabled();
  });

  it('downloads the v4 file when the report is ready', async () => {
    mockValidation({});
    exportMock.mockResolvedValue({ status: 200, data: new Blob(['<Bp21Bulk/>']) });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Unduh XML Coretax' }));

    await waitFor(() => expect(saveBlobFileMock).toHaveBeenCalled());
    expect(exportMock).toHaveBeenCalledWith('report-oct');
    expect(saveBlobFileMock.mock.calls[0]?.[0]).toMatchObject({
      fileName: 'coretax-bp21-2026-10-v4.xml',
    });
    expect(screen.getByText('3 bukti potong siap.')).toBeInTheDocument();
  });
});
