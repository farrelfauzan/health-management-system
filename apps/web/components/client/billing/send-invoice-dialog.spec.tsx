import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InvoiceDetail } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SendInvoiceDialog } from './send-invoice-dialog';
import { invoiceDeliveryControllerRequestDeliveryV1 } from '#lib/api/generated/invoice-delivery/invoice-delivery';
import { patientDeliveryConsentControllerListConsentsV1 } from '#lib/api/generated/patient-delivery-consent/patient-delivery-consent';
import clinicalMessages from '../../../messages/en/clinical.json';
import operationsMessages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/patient-delivery-consent/patient-delivery-consent', () => ({
  patientDeliveryConsentControllerListConsentsV1: vi.fn(),
  getPatientDeliveryConsentControllerListConsentsV1QueryKey: (patientId: string) => [
    `/api/v1/patients/${patientId}/delivery-consents`,
  ],
}));

vi.mock('#lib/api/generated/invoice-delivery/invoice-delivery', () => ({
  invoiceDeliveryControllerRequestDeliveryV1: vi.fn(),
}));

const listRequestMock = vi.mocked(patientDeliveryConsentControllerListConsentsV1);
const requestDeliveryMock = vi.mocked(invoiceDeliveryControllerRequestDeliveryV1);

const INVOICE = {
  id: 'invoice-1',
  invoiceNumber: 'INV/20260929/0001',
  patientId: 'patient-1',
  patient: { id: 'patient-1', mrn: 'RM-1', fullName: 'Rina' },
  status: 'PAID',
  totalAmount: 150000,
  items: [],
  createdAt: '2026-09-29T02:00:00.000Z',
} as unknown as InvoiceDetail;

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
  refusalReason: 'EMAIL_MISSING',
};

function mockReadiness(channels: unknown[]): void {
  listRequestMock.mockResolvedValue({
    status: 200,
    headers: {},
    data: { data: { patientId: 'patient-1', channels } },
  } as never);
}

function buildRefusal(): AxiosError {
  return new AxiosError('Unprocessable', '422', undefined, undefined, {
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      error: {
        code: 'DELIVERY_CHANNEL_REFUSED',
        message: 'refused',
        details: { channel: 'WHATSAPP', refusalReason: 'CONSENT_REVOKED' },
      },
    },
  });
}

function renderDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider
      locale="en"
      timeZone="Asia/Jakarta"
      messages={{ ...operationsMessages, ...clinicalMessages }}
    >
      <QueryClientProvider client={queryClient}>
        <SendInvoiceDialog invoice={INVOICE} open onOpenChange={() => undefined} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('SendInvoiceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadiness([READY_WHATSAPP, BLOCKED_EMAIL]);
    requestDeliveryMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: { invoiceId: 'invoice-1', deliveries: [] } },
    } as never);
  });

  it('disables a channel the patient cannot receive on, with the reason', async () => {
    renderDialog();

    const email = await screen.findByRole('checkbox', { name: /email/i });

    expect(email).toBeDisabled();
    expect(screen.getByText('No email address on the patient record.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /whatsapp/i })).toBeEnabled();
  });

  it('queues a password-protected attachment on the picked channel', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('checkbox', { name: /whatsapp/i }));
    await user.click(screen.getByRole('button', { name: 'Queue delivery' }));

    await waitFor(() =>
      expect(requestDeliveryMock).toHaveBeenCalledWith('invoice-1', {
        channels: ['WHATSAPP'],
        shape: 'ATTACHMENT',
      }),
    );
  });

  it('asks for a channel before submitting', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('checkbox', { name: /whatsapp/i });

    await user.click(screen.getByRole('button', { name: 'Queue delivery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick at least one channel.');
    expect(requestDeliveryMock).not.toHaveBeenCalled();
  });

  it('shows a send-time refusal against its channel', async () => {
    const user = userEvent.setup();
    requestDeliveryMock.mockRejectedValue(buildRefusal());
    renderDialog();

    await user.click(await screen.findByRole('checkbox', { name: /whatsapp/i }));
    await user.click(screen.getByRole('button', { name: 'Queue delivery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'WhatsApp: The patient opted out of delivery on this channel.',
    );
  });
});
