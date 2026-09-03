import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

const listEncounterDocumentsMock = vi.hoisted(() => vi.fn());
const getDownloadUrlMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  encounterDocumentControllerListEncounterDocumentsV1: listEncounterDocumentsMock,
  patientDocumentDetailControllerGetDownloadUrlV1: getDownloadUrlMock,
  getEncounterDocumentControllerListEncounterDocumentsV1QueryKey: (encounterId: string) => [
    'encounter-documents',
    encounterId,
  ],
}));

const { EncounterDocumentsPanel } = await import('./encounter-documents-panel');

const ENCOUNTER_ID = 'encounter-1';

function buildDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'doc-1',
    patientId: 'patient-1',
    encounterId: ENCOUNTER_ID,
    admissionId: null,
    category: 'LAB_RESULT',
    title: 'Hasil Lab Darah',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    language: 'ID',
    documentDate: '2026-09-01',
    notes: null,
    releasedToPatient: false,
    releasedAt: null,
    releasedById: null,
    uploadedById: 'user-1',
    uploadedByEmail: 'perawat@hms.test',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <EncounterDocumentsPanel encounterId={ENCOUNTER_ID} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('EncounterDocumentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEncounterDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          thisVisit: [buildDocument()],
          history: [
            buildDocument({ id: 'doc-2', encounterId: null, title: 'Rontgen Toraks' }),
            buildDocument({ id: 'doc-3', encounterId: 'encounter-0', title: 'Surat Rujukan' }),
            buildDocument({ id: 'doc-4', encounterId: null, title: 'Hasil USG' }),
          ],
        },
      },
    });
  });

  it('starts collapsed, showing a count of everything on file', async () => {
    // §7.2.6: the workspace is dense, so the panel is shut — but a doctor
    // still has to know at a glance whether the file has anything in it.
    renderPanel();

    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.queryByText('Hasil Lab Darah')).not.toBeInTheDocument();
  });

  it('shows this visit and history as separate groups when opened', async () => {
    renderPanel();
    await screen.findByText('4');

    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));

    expect(await screen.findByText('This visit')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Hasil Lab Darah')).toBeInTheDocument();
    expect(screen.getByText('Rontgen Toraks')).toBeInTheDocument();
  });

  it('does not re-derive the visit split from encounterId', async () => {
    // The server decides which documents belong to the visit. This response
    // deliberately disagrees with what a client-side filter on `encounterId`
    // would produce — the row below carries this encounter's id but the API
    // put it in history — and the panel must follow the server.
    listEncounterDocumentsMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          thisVisit: [],
          history: [buildDocument({ id: 'doc-9', title: 'Server Says History' })],
        },
      },
    });
    renderPanel();
    await screen.findByText('1');

    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));

    const historyHeading = await screen.findByText('History');
    const historyGroup = historyHeading.closest('section');
    expect(historyGroup).toHaveTextContent('Server Says History');
  });

  it('renders an empty this-visit group rather than hiding it', async () => {
    // A consultation with nothing filed today should read as "nothing new",
    // not as a panel that lost a section.
    listEncounterDocumentsMock.mockResolvedValue({
      status: 200,
      data: { data: { thisVisit: [], history: [buildDocument({ id: 'doc-5' })] } },
    });
    renderPanel();
    await screen.findByText('1');

    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));

    expect(await screen.findByText('This visit')).toBeInTheDocument();
    expect(screen.getByText('Nothing filed during this visit yet.')).toBeInTheDocument();
  });

  it('shows an access-lost state on 403 rather than an error', async () => {
    // A revoked assignment mid-session (§7.2.7). "Your access ended" and
    // "something broke" are different things to tell a clinician.
    listEncounterDocumentsMock.mockRejectedValue({ response: { status: 403 } });
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));

    expect(
      await screen.findByText("You no longer have access to this patient's documents."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hasil Lab Darah')).not.toBeInTheDocument();
  });

  it('mints a download URL with this encounter as the reading context', async () => {
    // P16-T14's acceptance criterion: the audit row records *where* the file
    // was opened, which the server can only know if the client says so.
    getDownloadUrlMock.mockResolvedValue({
      status: 200,
      data: { data: { url: 'https://storage.test/get', expiresAt: '2026-09-03T09:05:00.000Z' } },
    });
    vi.stubGlobal('open', vi.fn());
    renderPanel();
    await screen.findByText('4');
    await userEvent.click(screen.getByRole('button', { name: /Documents/ }));
    await screen.findByText('Hasil Lab Darah');

    await userEvent.click(screen.getAllByRole('button', { name: 'Download' })[0]!);

    expect(getDownloadUrlMock).toHaveBeenCalledWith('doc-1', { encounterId: ENCOUNTER_ID });
  });
});
