import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

const updateDocumentMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerUpdateDocumentV1: updateDocumentMock,
  getPatientDocumentControllerListDocumentsV1QueryKey: (patientId: string) => [
    'patient-documents',
    patientId,
  ],
}));

vi.mock('#lib/api/generated/encounters/encounters', () => ({
  encounterControllerListEncountersV1: vi.fn(),
  getEncounterControllerListEncountersV1QueryKey: (params?: unknown) => ['encounters', params],
}));

vi.mock('#lib/api/generated/admission-flow/admission-flow', () => ({
  admissionFlowControllerListAdmissionsV1: vi.fn(),
  getAdmissionFlowControllerListAdmissionsV1QueryKey: (params?: unknown) => [
    'admissions',
    params,
  ],
}));

const { EditDocumentDialog } = await import('./edit-document-dialog');

const WRITE_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
];

const DOCUMENT: PatientDocumentView = {
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
  notes: 'Puasa 10 jam',
  releasedToPatient: false,
  releasedAt: null,
  releasedById: null,
  uploadedById: 'user-1',
  uploadedByEmail: null,
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
};

function renderDialog(): { onSaved: ReturnType<typeof vi.fn>; onFailed: ReturnType<typeof vi.fn> } {
  const onSaved = vi.fn();
  const onFailed = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(WRITE_RULES)}>
          <EditDocumentDialog
            open
            onOpenChange={vi.fn()}
            patientId="patient-1"
            document={DOCUMENT}
            onSaved={onSaved}
            onFailed={onFailed}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onSaved, onFailed };
}

describe('EditDocumentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateDocumentMock.mockResolvedValue({ status: 200, data: { data: DOCUMENT } });
  });

  it('refuses to save when nothing changed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // The API rejects an empty patch too, but a round trip to learn that is
    // a worse answer than the sentence.
    expect(await screen.findByText('Change at least one field before saving.')).toBeInTheDocument();
    expect(updateDocumentMock).not.toHaveBeenCalled();
  });

  it('sends only the fields that changed', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Hasil Lab Darah Lengkap');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('Document updated.'));
    // Category, date, notes, and the visit link were untouched and stay off
    // the wire — a patch that re-sent them would re-write what it did not
    // mean to.
    expect(updateDocumentMock).toHaveBeenCalledWith('doc-1', {
      title: 'Hasil Lab Darah Lengkap',
    });
  });

  it('sends null to clear the notes', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Notes'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() =>
      expect(updateDocumentMock).toHaveBeenCalledWith('doc-1', { notes: null }),
    );
  });

  it('refuses an empty title', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Title'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Title cannot be empty.')).toBeInTheDocument();
    expect(updateDocumentMock).not.toHaveBeenCalled();
  });
});
