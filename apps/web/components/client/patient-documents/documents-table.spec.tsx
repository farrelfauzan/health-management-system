import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerGetDownloadUrlV1: vi.fn(),
  patientDocumentDetailControllerUpdateDocumentV1: vi.fn(),
  patientDocumentDetailControllerDeleteDocumentV1: vi.fn(),
  getPatientDocumentControllerListDocumentsV1QueryKey: (patientId: string) => [
    'patient-documents',
    patientId,
  ],
}));

const { DocumentsTable } = await import('./documents-table');

function buildDocument(overrides: Partial<PatientDocumentView> = {}): PatientDocumentView {
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
    uploadedById: 'user-abcdef123456',
    createdAt: '2026-08-30T09:00:00.000Z',
    updatedAt: '2026-08-30T09:00:00.000Z',
    ...overrides,
  };
}

const FULL_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
  { action: 'delete', subject: 'PatientDocument' },
];

const READ_WRITE_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'write', subject: 'PatientDocument' },
];

function renderTable(documents: PatientDocumentView[], rules: AppRule[]): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>
          <DocumentsTable
            patientId="patient-1"
            documents={documents}
            onResult={vi.fn()}
            onError={vi.fn()}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DocumentsTable', () => {
  it('shows a document with no visit as general', () => {
    renderTable([buildDocument()], FULL_RULES);

    expect(screen.getByText('Hasil Lab Darah')).toBeInTheDocument();
    expect(screen.getByText('Lab result')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Not released')).toBeInTheDocument();
  });

  it('names the visit a document is filed under', () => {
    renderTable(
      [
        buildDocument({ id: 'doc-enc', encounterId: 'encounter-11112222-aaaa' }),
        buildDocument({ id: 'doc-adm', title: 'Resume Pulang', admissionId: 'admission-3333' }),
      ],
      FULL_RULES,
    );

    // The visit column is the same split the encounter workspace's "this
    // visit" panel is built on, so it has to be legible here too.
    expect(screen.getByText('Visit')).toBeInTheDocument();
    expect(screen.getByText('Admission')).toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });

  it('marks a released document', () => {
    renderTable(
      [buildDocument({ releasedToPatient: true, releasedAt: '2026-08-31T00:00:00.000Z' })],
      FULL_RULES,
    );

    expect(screen.getByText('Released to patient')).toBeInTheDocument();
  });

  it('offers delete only to a role holding the delete grant', () => {
    renderTable([buildDocument()], READ_WRITE_RULES);

    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // A doctor's own-patient grant is read/write/release; delete is an
    // administrator's. The control is hidden, and the API would refuse it
    // regardless.
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('offers delete to an administrator', () => {
    renderTable([buildDocument()], FULL_RULES);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
