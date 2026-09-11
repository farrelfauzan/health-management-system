import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MedicationFormDialog } from './medication-form-dialog';
import { medicationControllerSearchKfaProductsV1 } from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import clinicalMessages from '../../../messages/en/clinical.json';
import pharmacyMessages from '../../../messages/en/pharmacy-inventory.json';

function render(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return testingRender(
    <NextIntlClientProvider locale="en" messages={{ ...pharmacyMessages, ...clinicalMessages }}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

vi.mock('#lib/api/generated/pharmacy-flow/pharmacy-flow', () => ({
  medicationControllerCreateMedicationV1: vi.fn(),
  medicationControllerUpdateMedicationV1: vi.fn(),
  medicationControllerSearchKfaProductsV1: vi.fn(),
  getMedicationControllerSearchKfaProductsV1QueryKey: (
    params: Record<string, unknown>,
  ): unknown[] => ['/api/v1/medications/kfa-products', params],
}));

const kfaSearchMock = vi.mocked(medicationControllerSearchKfaProductsV1);

function buildKfaResponse() {
  return {
    status: 200,
    data: {
      data: [
        {
          kfaCode: '93011120',
          name: 'Paracetamol 500 mg Tablet (KIMIA FARMA)',
          dosageForm: 'Tablet',
          manufacturer: 'KIMIA FARMA',
          packagingUnit: 'Tablet',
          isActive: true,
        },
      ],
    },
  };
}

describe('MedicationFormDialog KFA lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills the KFA code from the product a pharmacist picks', async () => {
    kfaSearchMock.mockResolvedValue(buildKfaResponse() as never);
    render(
      <MedicationFormDialog
        open
        onOpenChange={() => {}}
        medication={null}
        onSaved={() => {}}
      />,
    );

    await userEvent.type(screen.getByLabelText('Search the KFA dictionary'), 'paracetamol');

    const option = await screen.findByRole('button', { name: /93011120/ }, { timeout: 3000 });
    await userEvent.click(option);

    await waitFor(() => {
      expect(screen.getByLabelText('KFA code')).toHaveValue('93011120');
    });
  });

  it('does not spend an upstream call on a term below the minimum length', async () => {
    render(
      <MedicationFormDialog
        open
        onOpenChange={() => {}}
        medication={null}
        onSaved={() => {}}
      />,
    );

    await userEvent.type(screen.getByLabelText('Search the KFA dictionary'), 'pa');

    await waitFor(() => {
      expect(kfaSearchMock).not.toHaveBeenCalled();
    });
  });
});
