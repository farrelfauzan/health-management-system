import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PatientDocumentView } from '@hms/shared-types';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/clinical.json';

const { releaseMock, listDeliveriesMock, listConsentsMock } = vi.hoisted(() => ({
  releaseMock: vi.fn(),
  listDeliveriesMock: vi.fn(),
  listConsentsMock: vi.fn(),
}));

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  patientDocumentDetailControllerReleaseDocumentV1: releaseMock,
  patientDocumentDetailControllerListDeliveriesV1: listDeliveriesMock,
  getPatientDocumentDetailControllerListDeliveriesV1QueryKey: (documentId: string) => [
    `/api/v1/patient-documents/${documentId}/deliveries`,
  ],
  getPatientDocumentControllerListDocumentsV1QueryKey: (patientId: string) => [
    'patient-documents',
    patientId,
  ],
}));

vi.mock('#lib/api/generated/patient-delivery-consent/patient-delivery-consent', () => ({
  patientDeliveryConsentControllerListConsentsV1: listConsentsMock,
  getPatientDeliveryConsentControllerListConsentsV1QueryKey: (patientId: string) => [
    `/api/v1/patients/${patientId}/delivery-consents`,
  ],
}));

const { ReleaseDocumentButton } = await import('./release-document-button');

const RELEASE_RULES: AppRule[] = [
  { action: 'read', subject: 'PatientDocument' },
  { action: 'release', subject: 'PatientDocument' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'PatientDocument' }];

const READY_WHATSAPP = {
  channel: 'WHATSAPP',
  consent: null,
  isDeliveryAllowed: true,
  refusalReason: null,
};

const BLOCKED_EMAIL = {
  channel: 'EMAIL',
  consent: null,
  isDeliveryAllowed: false,
  refusalReason: 'CONSENT_MISSING',
};

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

function mockTimeline(isDispatchByDefault: boolean): void {
  listDeliveriesMock.mockResolvedValue({
    status: 200,
    data: {
      data: { documentId: 'doc-1', category: 'LAB_RESULT', isDispatchByDefault, deliveries: [] },
    },
  });
}

function mockReleaseResult(overrides: Record<string, unknown> = {}): void {
  releaseMock.mockResolvedValue({
    status: 200,
    data: {
      data: {
        document: buildDocument({ releasedToPatient: true }),
        deliveries: [],
        refusedChannels: [],
        isDoctorNotified: false,
        ...overrides,
      },
    },
  });
}

function renderButton(rules: AppRule[], document = buildDocument()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onResult = vi.fn();
  const onError = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>
          <ReleaseDocumentButton
            patientId="patient-1"
            document={document}
            onResult={onResult}
            onError={onError}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onResult, onError };
}

describe('ReleaseDocumentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConsentsMock.mockResolvedValue({
      status: 200,
      data: { data: { patientId: 'patient-1', channels: [READY_WHATSAPP, BLOCKED_EMAIL] } },
    });
    mockTimeline(false);
    mockReleaseResult();
  });

  it('is hidden for a role without the release grant', () => {
    // Visibility only — the backend guard is what refuses. This keeps a
    // receptionist from being shown a control that would 403.
    renderButton(READ_ONLY_RULES);

    expect(screen.queryByRole('button', { name: 'Release to patient' })).not.toBeInTheDocument();
  });

  it('is hidden on an already-released document', () => {
    // There is no un-release in v1, so the control has nothing to do here.
    renderButton(RELEASE_RULES, buildDocument({ releasedToPatient: true }));

    expect(screen.queryByRole('button', { name: 'Release to patient' })).not.toBeInTheDocument();
  });

  it('confirms in the patient’s terms and offers the channels the patient can receive on', async () => {
    // Not "are you sure": the clinician is deciding that a person reads this
    // at home, so the dialog says what the patient will see.
    renderButton(RELEASE_RULES);

    await userEvent.click(screen.getByRole('button', { name: 'Release to patient' }));

    expect(
      await screen.findByText(
        'The patient will see “Hasil Lab Darah” in their portal and can download it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This cannot be undone from here — there is no un-release.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /WhatsApp/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Email/ })).toBeDisabled();
    expect(screen.getByText('No consent recorded for this channel.')).toBeInTheDocument();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('releases without dispatch when nothing is ticked', async () => {
    const { onResult } = renderButton(RELEASE_RULES);

    await userEvent.click(screen.getByRole('button', { name: 'Release to patient' }));
    await screen.findByRole('checkbox', { name: /WhatsApp/ });
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(releaseMock).toHaveBeenCalledWith('doc-1', {}));
    expect(onResult).toHaveBeenCalledWith('Document released to the patient.');
  });

  it('pre-ticks the ready channels for a category that dispatches by default, and sends', async () => {
    mockTimeline(true);
    mockReleaseResult({
      deliveries: [{ id: 'delivery-1', channel: 'WHATSAPP', status: 'QUEUED' }],
      refusedChannels: [{ channel: 'EMAIL', refusalReason: 'CONSENT_MISSING' }],
      isDoctorNotified: true,
    });
    const { onResult } = renderButton(RELEASE_RULES);

    await userEvent.click(screen.getByRole('button', { name: 'Release to patient' }));
    const whatsapp = await screen.findByRole('checkbox', { name: /WhatsApp/ });
    await waitFor(() => expect(whatsapp).toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() =>
      expect(releaseMock).toHaveBeenCalledWith('doc-1', { dispatch: { channels: ['WHATSAPP'] } }),
    );
    expect(onResult).toHaveBeenCalledWith(
      'Document released and queued to the patient over WhatsApp. Document released. Not sent: Email (No consent recorded for this channel.). The attending doctor was notified.',
    );
  });

  it('lets the clinician untick a default channel', async () => {
    mockTimeline(true);
    renderButton(RELEASE_RULES);

    await userEvent.click(screen.getByRole('button', { name: 'Release to patient' }));
    const whatsapp = await screen.findByRole('checkbox', { name: /WhatsApp/ });
    await waitFor(() => expect(whatsapp).toBeChecked());
    await userEvent.click(whatsapp);
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(releaseMock).toHaveBeenCalledWith('doc-1', {}));
  });

  it('surfaces a refusal rather than swallowing it', async () => {
    // The doctor's assignment can be gone by the time they click. CASL showed
    // the control; the API is what decides, and the clinician has to be told.
    releaseMock.mockRejectedValue({ response: { status: 403 } });
    const { onError } = renderButton(RELEASE_RULES);

    await userEvent.click(screen.getByRole('button', { name: 'Release to patient' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Release' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Unable to release this document.'));
  });
});
