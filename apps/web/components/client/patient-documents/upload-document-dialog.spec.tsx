import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import clinicalMessages from '../../../messages/en/clinical.json';
import sharedMessages from '../../../messages/en/shared.json';

const uploadPatientDocumentMock = vi.hoisted(() => vi.fn());
const createUploadUrlMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/patient-documents/upload-patient-document', () => ({
  uploadPatientDocument: uploadPatientDocumentMock,
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentControllerCreateUploadUrlV1: createUploadUrlMock,
  patientDocumentControllerConfirmUploadV1: vi.fn(),
  patientDocumentControllerListDocumentsV1: vi.fn(),
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

const { PatientDocumentUploadError } = await import(
  '#lib/patient-documents/patient-document-upload-error'
);
const { UploadDocumentDialog } = await import('./upload-document-dialog');

const WRITE_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
];

const MEBIBYTE = 1024 * 1024;

function buildFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function renderDialog(onUploaded = vi.fn()): { onUploaded: ReturnType<typeof vi.fn> } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ ...clinicalMessages, ...sharedMessages }}
      timeZone="Asia/Jakarta"
    >
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(WRITE_RULES)}>
          <UploadDocumentDialog
            open
            onOpenChange={vi.fn()}
            patientId="patient-1"
            onUploaded={onUploaded}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onUploaded };
}

describe('UploadDocumentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('refuses an oversize file before any request, naming the 20 MB limit', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(screen.getByLabelText('Files'), buildFile('radiologi.pdf', 'application/pdf', 25 * MEBIBYTE));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'radiologi.pdf is larger than the 20 MB limit.',
    );
    expect(screen.queryByText(/file selected/)).not.toBeInTheDocument();
    expect(createUploadUrlMock).not.toHaveBeenCalled();
    expect(uploadPatientDocumentMock).not.toHaveBeenCalled();
  });

  it('refuses a type outside PDF, JPEG, PNG, and WebP even when the store would take it', async () => {
    renderDialog();

    // `text/plain` is on the document store's allowlist for the knowledge
    // base; a clinical record narrows it, and the picker must enforce the
    // narrower set. `applyAccept: false` because an OS dialog set to "All
    // files" ignores the accept hint entirely.
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText('Files'), buildFile('catatan.txt', 'text/plain', 2048));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'catatan.txt is not an accepted file type.',
    );
    expect(screen.queryByText(/file selected/)).not.toBeInTheDocument();
  });

  it('keeps the accepted files from a mixed pick and names the rejected one', async () => {
    renderDialog();

    await userEvent
      .setup()
      .upload(screen.getByLabelText('Files'), [
        buildFile('hasil-lab.pdf', 'application/pdf', 4096),
        buildFile('scan.png', 'image/png', 25 * MEBIBYTE),
      ]);

    expect(await screen.findByText('1 file selected')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.png is larger than the 20 MB limit.');
    // The title defaults to the filename so a person uploading six pages
    // does not type six titles.
    expect(screen.getByLabelText('Title for hasil-lab.pdf')).toHaveValue('hasil-lab.pdf');
  });

  it('requires a category before uploading', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText('Files'), buildFile('hasil-lab.pdf', 'application/pdf', 4096));
    await user.click(screen.getByRole('button', { name: 'Upload 1 file' }));

    expect(await screen.findByText('Choose a category.')).toBeInTheDocument();
    expect(uploadPatientDocumentMock).not.toHaveBeenCalled();
  });

  it('records the files that succeed when another in the batch fails', async () => {
    uploadPatientDocumentMock.mockImplementation(async ({ title }: { title: string }) => {
      if (title === 'rusak.pdf') {
        throw new PatientDocumentUploadError('confirm', new Error('content check failed'));
      }
      return { outcome: 'recorded' };
    });
    const user = userEvent.setup();
    const { onUploaded } = renderDialog();

    await user.upload(screen.getByLabelText('Files'), [
      buildFile('hasil-lab.pdf', 'application/pdf', 4096),
      buildFile('rusak.pdf', 'application/pdf', 4096),
    ]);
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'Lab result' }));
    await user.click(screen.getByRole('button', { name: 'Upload 2 files' }));

    // Both were attempted, each row says what happened to it, and the
    // failed one is told the only remedy that works after a confirm failure.
    expect(await screen.findByText('Recorded')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('The file uploaded but could not be recorded. Remove it and pick it again.'),
    ).toBeInTheDocument();
    expect(uploadPatientDocumentMock).toHaveBeenCalledTimes(2);
    expect(onUploaded).toHaveBeenCalledWith('1 file recorded, 1 failed.');
    // The failed row is still there to retry; the recorded one is done.
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeInTheDocument();
  });
});
