import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

const listDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentControllerListDocumentsV1: listDocumentsMock,
  patientDocumentControllerCreateUploadUrlV1: vi.fn(),
  patientDocumentControllerConfirmUploadV1: vi.fn(),
  patientDocumentDetailControllerGetDownloadUrlV1: vi.fn(),
  patientDocumentDetailControllerUpdateDocumentV1: vi.fn(),
  patientDocumentDetailControllerDeleteDocumentV1: vi.fn(),
  getPatientDocumentControllerListDocumentsV1QueryKey: (patientId: string, params?: unknown) => [
    'patient-documents',
    patientId,
    ...(params ? [params] : []),
  ],
}));

const { PatientDocumentsPanel } = await import('./patient-documents-panel');

const READ_WRITE_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'PatientDocument' }];

function buildDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    patientId: 'patient-1',
    encounterId: null,
    admissionId: null,
    category: 'LAB_RESULT',
    title: 'Hasil Lab Darah',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    language: 'ID',
    documentDate: '2026-08-30',
    notes: null,
    releasedToPatient: false,
    releasedAt: null,
    releasedById: null,
    uploadedById: 'user-1',
    createdAt: '2026-08-30T09:00:00.000Z',
    updatedAt: '2026-08-30T09:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(rules: AppRule[] = READ_WRITE_RULES): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>
          <PatientDocumentsPanel patientId="patient-1" />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientDocumentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildDocument()], meta: { nextCursor: null } },
    });
  });

  it('lists the patient documents unfiltered by default', async () => {
    renderPanel();

    expect(await screen.findByText('Hasil Lab Darah')).toBeInTheDocument();
    expect(listDocumentsMock).toHaveBeenCalledWith('patient-1', {}, expect.anything());
  });

  it('says download is the interaction when the record is empty', async () => {
    listDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { nextCursor: null } },
    });
    renderPanel();

    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByText(/there is no in-page preview/)).toBeInTheDocument();
  });

  it('narrows the list by category and clears back to everything', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Hasil Lab Darah');

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'Radiology' }));

    await vi.waitFor(() =>
      expect(listDocumentsMock).toHaveBeenLastCalledWith(
        'patient-1',
        { category: 'RADIOLOGY' },
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await vi.waitFor(() =>
      expect(listDocumentsMock).toHaveBeenLastCalledWith('patient-1', {}, expect.anything()),
    );
  });

  it('offers load more while the API reports a next cursor', async () => {
    const user = userEvent.setup();
    listDocumentsMock
      .mockResolvedValueOnce({
        status: 200,
        data: { data: [buildDocument()], meta: { nextCursor: 'cursor-2' } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: [buildDocument({ id: 'doc-2', title: 'Surat Rujukan' })],
          meta: { nextCursor: null },
        },
      });
    renderPanel();
    await screen.findByText('Hasil Lab Darah');

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Surat Rujukan')).toBeInTheDocument();
    // The first page stays; the second is appended under the same filters.
    expect(screen.getByText('Hasil Lab Darah')).toBeInTheDocument();
    expect(listDocumentsMock).toHaveBeenLastCalledWith(
      'patient-1',
      { cursor: 'cursor-2' },
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('hides the upload button from a role without the write grant', async () => {
    renderPanel(READ_ONLY_RULES);
    await screen.findByText('Hasil Lab Darah');

    expect(screen.queryByRole('button', { name: /Upload documents/ })).not.toBeInTheDocument();
  });
});
