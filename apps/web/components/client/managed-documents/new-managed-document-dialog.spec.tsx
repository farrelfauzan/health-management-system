import type { DocumentTypeView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewManagedDocumentDialog } from './new-managed-document-dialog';
import { documentTypeControllerListTypesV1 } from '#lib/api/generated/document-types/document-types';
import { managedDocumentControllerCreateDocumentV1 } from '#lib/api/generated/documents/documents';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/document-types/document-types', () => ({
  documentTypeControllerListTypesV1: vi.fn(),
  getDocumentTypeControllerListTypesV1QueryKey: (params?: unknown) => [
    '/api/v1/document-types',
    params,
  ],
}));

vi.mock('#lib/api/generated/documents/documents', () => ({
  managedDocumentControllerCreateDocumentV1: vi.fn(),
  managedDocumentControllerCreateUploadUrlV1: vi.fn(),
}));

vi.mock('#lib/api/generated/patient-management/patient-management', () => ({
  patientManagementControllerListPatientsV1: vi.fn(async () => ({
    status: 200,
    headers: {},
    data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
  })),
  getPatientManagementControllerListPatientsV1QueryKey: (params?: unknown) => [
    '/api/v1/patients',
    params,
  ],
}));

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerListDoctorsV1: vi.fn(async () => ({
    status: 200,
    headers: {},
    data: { data: [], meta: { page: 1, limit: 50, total: 0 } },
  })),
  getDoctorManagementControllerListDoctorsV1QueryKey: (params?: unknown) => [
    '/api/v1/doctors',
    params,
  ],
}));

// The TipTap editor needs a real DOM range API jsdom lacks; the form's
// contract with it is `value`/`onValueChange`, which a textarea honours.
vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return {
    ...actual,
    RichTextEditor: ({
      id,
      value,
      onValueChange,
    }: {
      id?: string;
      value: string;
      onValueChange: (value: string) => void;
    }) => (
      <textarea
        id={id}
        aria-label="editor"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    ),
  };
});

// Radix Select drives its trigger with the pointer-capture API, which jsdom
// does not implement; the shell's setup file covers ResizeObserver and
// scrollIntoView but not these three.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

const listTypesMock = vi.mocked(documentTypeControllerListTypesV1);
const createMock = vi.mocked(managedDocumentControllerCreateDocumentV1);

function buildType(overrides: Partial<DocumentTypeView>): DocumentTypeView {
  return {
    id: 'type-agreement',
    code: 'AGREEMENT_PATIENT_CLINIC',
    name: 'Perjanjian pasien–klinik',
    description: null,
    behavior: 'GENERIC',
    isSystem: true,
    isApprovalRequired: true,
    allowSelfApproval: false,
    requiredApprovals: 1,
    requiresPatient: true,
    requiresDoctor: false,
    contentMode: 'EITHER',
    isActive: true,
    sortOrder: 10,
    documentCount: 0,
    defaultApprovers: [],
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    ...overrides,
  };
}

const TYPES: DocumentTypeView[] = [
  buildType({}),
  buildType({
    id: 'type-policy',
    code: 'CLINIC_POLICY_SOP',
    name: 'Kebijakan dan SOP klinik',
    requiresPatient: false,
    contentMode: 'DRAFTED',
  }),
];

function renderDialog() {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <NewManagedDocumentDialog open onOpenChange={onOpenChange} onCreated={onCreated} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange, onCreated };
}

async function chooseType(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(await screen.findByRole('combobox', { name: 'Type' }));
  await user.click(await screen.findByRole('option', { name }));
}

describe('NewManagedDocumentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTypesMock.mockResolvedValue({ status: 200, headers: {}, data: { data: TYPES } } as never);
    createMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: { id: 'doc-1' } },
    } as never);
  });

  it('builds the form from the type: a patient picker for an agreement, none for a policy', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByLabelText('Patient')).not.toBeInTheDocument();
    await chooseType(user, 'Perjanjian pasien–klinik');

    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.queryByText('Doctor')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Write it here' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Upload a signed copy' })).toBeInTheDocument();

    await chooseType(user, 'Kebijakan dan SOP klinik');

    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByLabelText('editor')).toBeInTheDocument();
  });

  it('refuses an agreement without its patient before calling the API', async () => {
    const user = userEvent.setup();
    renderDialog();

    await chooseType(user, 'Perjanjian pasien–klinik');
    await user.type(screen.getByLabelText('Title'), 'Perjanjian biaya');
    await user.click(screen.getByRole('button', { name: 'Create document' }));

    expect(await screen.findByText('This type requires a patient.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('drafts a policy with the editor body and no storage key', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await chooseType(user, 'Kebijakan dan SOP klinik');
    await user.type(screen.getByLabelText('Title'), 'SOP pendaftaran');
    await user.type(screen.getByLabelText('editor'), '<p>Langkah 1</p>');
    await user.click(screen.getByRole('button', { name: 'Create document' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [payload] = createMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      typeId: 'type-policy',
      title: 'SOP pendaftaran',
      contentHtml: '<p>Langkah 1</p>',
    });
    expect(payload).not.toHaveProperty('storageKey');
    expect(payload).not.toHaveProperty('patientId');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('Document drafted.'));
  });
});
