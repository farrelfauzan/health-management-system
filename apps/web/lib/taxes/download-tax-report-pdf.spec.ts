import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderPdfMock = vi.hoisted(() => vi.fn());
const createPdfDownloadUrlMock = vi.hoisted(() => vi.fn());
const saveBlobFileMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/tax-reports/tax-reports', () => ({
  taxReportControllerRenderPdfV1: renderPdfMock,
  taxReportControllerCreatePdfDownloadUrlV1: createPdfDownloadUrlMock,
}));
vi.mock('#lib/shared/save-blob-file', () => ({ saveBlobFile: saveBlobFileMock }));

import { downloadTaxReportPdf } from '#lib/taxes/download-tax-report-pdf';

describe('downloadTaxReportPdf (P27-T12)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { assign: assignMock });
  });

  it('saves a draft from the rendered bytes, never asking for a stored link', async () => {
    const inputBlob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    renderPdfMock.mockResolvedValue({ status: 200, data: inputBlob });

    await downloadTaxReportPdf({
      id: 'r1',
      period: '2026-09',
      kind: 'PP55_OMZET',
      status: 'DRAFT',
    });

    expect(saveBlobFileMock).toHaveBeenCalledWith({
      blob: inputBlob,
      fileName: 'pajak-pp55-omzet-2026-09-draft.pdf',
    });
    expect(createPdfDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('opens the stored file of a finalized report through its signed link', async () => {
    createPdfDownloadUrlMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          url: 'https://storage.example/signed',
          fileName: 'pajak-ppn-output-2026-08.pdf',
          expiresAt: '2026-09-19T08:00:00.000Z',
        },
      },
    });

    await downloadTaxReportPdf({
      id: 'r2',
      period: '2026-08',
      kind: 'PPN_OUTPUT',
      status: 'FINALIZED',
    });

    expect(assignMock).toHaveBeenCalledWith('https://storage.example/signed');
    expect(renderPdfMock).not.toHaveBeenCalled();
  });
});
