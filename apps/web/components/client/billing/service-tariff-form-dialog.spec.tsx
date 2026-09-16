import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ServiceTariffResponse } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceTariffFormDialog } from './service-tariff-form-dialog';
import {
  serviceTariffControllerCreateServiceTariffV1,
  serviceTariffControllerUpdateServiceTariffV1,
} from '#lib/api/generated/service-tariffs/service-tariffs';
import operationsMessages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/service-tariffs/service-tariffs', () => ({
  serviceTariffControllerCreateServiceTariffV1: vi.fn(),
  serviceTariffControllerUpdateServiceTariffV1: vi.fn(),
  getServiceTariffControllerListServiceTariffsV1QueryKey: (params: unknown) => [
    '/api/v1/service-tariffs',
    params,
  ],
}));

const MIDWIFERY_SPECIALTY_ID = '2e1b6a3d-4f5c-4d6e-9f70-8b9c0d1e2f30';

vi.mock('#lib/specialties/use-specialties-list', () => ({
  useSpecialtiesList: () => ({
    specialties: [{ id: MIDWIFERY_SPECIALTY_ID, name: 'Kebidanan' }],
    isPending: false,
    isError: false,
  }),
}));

const createRequestMock = vi.mocked(serviceTariffControllerCreateServiceTariffV1);
const updateRequestMock = vi.mocked(serviceTariffControllerUpdateServiceTariffV1);

const CONSULTATION_TARIFF: ServiceTariffResponse = {
  id: '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e',
  code: 'KONSULTASI-BIDAN',
  name: 'Pemeriksaan Bidan',
  category: 'CONSULTATION',
  specialtyId: MIDWIFERY_SPECIALTY_ID,
  specialty: { id: MIDWIFERY_SPECIALTY_ID, name: 'Kebidanan' },
  profession: 'MIDWIFE',
  price: 30000,
  isActive: true,
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-01T02:00:00.000Z',
};

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

function renderDialog(tariff: ServiceTariffResponse | null): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" messages={operationsMessages}>
      <QueryClientProvider client={queryClient}>
        <ServiceTariffFormDialog open onOpenChange={() => {}} tariff={tariff} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('ServiceTariffFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestMock.mockResolvedValue(buildEnvelope(CONSULTATION_TARIFF) as never);
    updateRequestMock.mockResolvedValue(buildEnvelope(CONSULTATION_TARIFF) as never);
  });

  it('sends the poli and profession a consultation tariff prices', async () => {
    const user = userEvent.setup();
    renderDialog(null);

    await user.type(screen.getByLabelText('Code'), 'KONSULTASI-BIDAN');
    await user.type(screen.getByLabelText('Name'), 'Pemeriksaan Bidan');
    await user.type(screen.getByLabelText('Price (Rp)'), '30000');
    await user.click(screen.getByRole('combobox', { name: 'Poli' }));
    await user.click(await screen.findByText('Kebidanan'));
    await user.click(screen.getByRole('combobox', { name: 'Profession' }));
    await user.click(await screen.findByRole('option', { name: 'Midwife' }));
    await user.click(screen.getByRole('button', { name: 'Save Tariff' }));

    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'CONSULTATION',
          specialtyId: MIDWIFERY_SPECIALTY_ID,
          profession: 'MIDWIFE',
        }),
      ),
    );
  });

  it('drops a legacy ICD-9-CM code when a consultation tariff is saved', async () => {
    const user = userEvent.setup();
    renderDialog({ ...CONSULTATION_TARIFF, icd9cmCode: '89.07' });

    expect(screen.queryByLabelText('ICD-9-CM Code')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Tariff' }));

    await waitFor(() =>
      expect(updateRequestMock).toHaveBeenCalledWith(
        CONSULTATION_TARIFF.id,
        expect.objectContaining({ category: 'CONSULTATION', icd9cmCode: null }),
      ),
    );
  });

  it('clears the audience when the tariff stops being a consultation', async () => {
    const user = userEvent.setup();
    renderDialog(CONSULTATION_TARIFF);

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'OTHER' }));
    await user.click(screen.getByRole('button', { name: 'Save Tariff' }));

    await waitFor(() =>
      expect(updateRequestMock).toHaveBeenCalledWith(
        CONSULTATION_TARIFF.id,
        expect.objectContaining({ category: 'OTHER', specialtyId: null, profession: null }),
      ),
    );
  });
});
