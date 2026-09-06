import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InvoiceDetail, ServiceTariffResponse } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddInvoiceItemForm } from './add-invoice-item-form';
import { invoiceControllerAddInvoiceItemV1 } from '#lib/api/generated/invoices/invoices';
import { serviceTariffControllerListServiceTariffsV1 } from '#lib/api/generated/service-tariffs/service-tariffs';
import operationsMessages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/invoices/invoices', () => ({
  invoiceControllerAddInvoiceItemV1: vi.fn(),
}));

vi.mock('#lib/api/generated/service-tariffs/service-tariffs', () => ({
  serviceTariffControllerListServiceTariffsV1: vi.fn(),
  getServiceTariffControllerListServiceTariffsV1QueryKey: (params: unknown) => [
    '/api/v1/service-tariffs',
    params,
  ],
}));

const addRequestMock = vi.mocked(invoiceControllerAddInvoiceItemV1);
const listTariffsMock = vi.mocked(serviceTariffControllerListServiceTariffsV1);

const UNMAPPED_TARIFF: ServiceTariffResponse = {
  id: '9d2e4f60-7b8c-4c9d-a0e1-4f5a6b7c8d9e',
  code: 'TIND-JAHIT-LUKA',
  name: 'Jahit Luka Ringan',
  category: 'PROCEDURE',
  price: 75000,
  isActive: true,
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-01T02:00:00.000Z',
};

function buildInvoice(): InvoiceDetail {
  return {
    id: 'invoice-1',
    invoiceNumber: 'INV/20260905/0005',
    patientId: 'patient-1',
    patient: { id: 'patient-1', mrn: '00000908', fullName: 'Siti Rahmawati' },
    status: 'DRAFT',
    totalAmount: 50000,
    items: [],
    createdAt: '2026-09-05T02:00:00.000Z',
    updatedAt: '2026-09-05T02:00:00.000Z',
  };
}

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

function renderForm(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={operationsMessages}>
      <QueryClientProvider client={queryClient}>
        <AddInvoiceItemForm invoice={buildInvoice()} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('AddInvoiceItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTariffsMock.mockResolvedValue(buildEnvelope([UNMAPPED_TARIFF]) as never);
    addRequestMock.mockResolvedValue(buildEnvelope(buildInvoice()) as never);
  });

  it('offers every active tariff, including one with no ICD-9-CM code, and posts the chosen line', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByText(/Jahit Luka Ringan/));
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.click(screen.getByRole('button', { name: 'Add line' }));

    await waitFor(() =>
      expect(addRequestMock).toHaveBeenCalledWith('invoice-1', {
        serviceTariffId: UNMAPPED_TARIFF.id,
        quantity: 2,
      }),
    );
    expect(listTariffsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: 'true' }),
      expect.anything(),
    );
  });

  it('refuses to submit without a tariff', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole('button', { name: 'Add line' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick the tariff to add.');
    expect(addRequestMock).not.toHaveBeenCalled();
  });
});
