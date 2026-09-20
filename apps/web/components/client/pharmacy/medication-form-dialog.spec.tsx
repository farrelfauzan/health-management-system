import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MedicationFormDialog } from './medication-form-dialog';
import type { MedicationResponse } from '@hms/shared-types';
import {
  medicationControllerCreateMedicationV1,
  medicationControllerSearchKfaProductsV1,
  medicationControllerUpdateMedicationV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
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
const createRequestMock = vi.mocked(medicationControllerCreateMedicationV1);
const updateRequestMock = vi.mocked(medicationControllerUpdateMedicationV1);

const PRICED_MEDICATION: MedicationResponse = {
  id: 'e1790b08-3130-4edd-bddb-f524680d820f',
  code: 'MED-MCG-200',
  name: 'Microgest 200 mg',
  unit: 'TABLET',
  category: 'OBAT_KERAS',
  stockQty: 30,
  reorderLevel: 0,
  needsReorder: false,
  isVaccine: false,
  isMidwifePrescribable: false,
  unitPrice: 2500,
  createdAt: '2026-09-16T02:00:00.000Z',
  updatedAt: '2026-09-16T02:00:00.000Z',
};

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

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
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
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
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
    );

    await userEvent.type(screen.getByLabelText('Search the KFA dictionary'), 'pa');

    await waitFor(() => {
      expect(kfaSearchMock).not.toHaveBeenCalled();
    });
  });
});

describe('MedicationFormDialog selling price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestMock.mockResolvedValue(buildEnvelope(PRICED_MEDICATION) as never);
    updateRequestMock.mockResolvedValue(buildEnvelope(PRICED_MEDICATION) as never);
  });

  it('sends the price a pharmacist types', async () => {
    render(
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
    );

    await userEvent.type(screen.getByLabelText(/^Medication code/), 'MED-MCG-200');
    await userEvent.type(screen.getByLabelText(/^Medication name/), 'Microgest 200 mg');
    await userEvent.type(screen.getByLabelText('Selling price per unit (Rp)'), '2500');
    await userEvent.click(screen.getByRole('button', { name: 'Save medication' }));

    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 2500 })),
    );
  });

  it('withdraws a price when the field is cleared on edit', async () => {
    render(
      <MedicationFormDialog
        open
        onOpenChange={() => {}}
        medication={PRICED_MEDICATION}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByLabelText('Selling price per unit (Rp)')).toHaveValue('2500');
    await userEvent.clear(screen.getByLabelText('Selling price per unit (Rp)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save medication' }));

    await waitFor(() =>
      expect(updateRequestMock).toHaveBeenCalledWith(
        PRICED_MEDICATION.id,
        expect.objectContaining({ unitPrice: null }),
      ),
    );
  });

  it('refuses a price that is not a rupiah amount', async () => {
    render(
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
    );

    await userEvent.type(screen.getByLabelText(/^Medication code/), 'MED-MCG-200');
    await userEvent.type(screen.getByLabelText(/^Medication name/), 'Microgest 200 mg');
    await userEvent.type(screen.getByLabelText('Selling price per unit (Rp)'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save medication' }));

    expect(
      await screen.findByText('Enter the price in rupiah, or leave it blank.'),
    ).toBeInTheDocument();
    expect(createRequestMock).not.toHaveBeenCalled();
  });
});

// P25-T05 (FR-FORM-01). Flagged for a bidan's formulary is not the same as
// hers to write: a bound item names the kewenangan she needs.
describe('MedicationFormDialog midwife authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestMock.mockResolvedValue(buildEnvelope(PRICED_MEDICATION) as never);
    updateRequestMock.mockResolvedValue(buildEnvelope(PRICED_MEDICATION) as never);
  });

  it('hides the authority field until the item is in the midwife formulary', async () => {
    render(
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
    );

    expect(screen.queryByLabelText('Authority a midwife needs')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/midwife may prescribe/i));

    expect(await screen.findByLabelText('Authority a midwife needs')).toBeInTheDocument();
  });

  it('sends null for an item that sits inside her own authority', async () => {
    render(
      <MedicationFormDialog open onOpenChange={() => {}} medication={null} onSaved={() => {}} />,
    );

    await userEvent.type(screen.getByLabelText(/^Medication code/), 'MED-FE-001');
    await userEvent.type(screen.getByLabelText(/^Medication name/), 'Tablet Tambah Darah');
    await userEvent.click(screen.getByLabelText(/midwife may prescribe/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save medication' }));

    await waitFor(() =>
      expect(createRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ isMidwifePrescribable: true, midwifeAuthorityKind: null }),
      ),
    );
  });

  it('badges a bound item with the authority it names, and sends that kind', async () => {
    render(
      <MedicationFormDialog
        open
        onOpenChange={() => {}}
        medication={{
          ...PRICED_MEDICATION,
          isMidwifePrescribable: true,
          midwifeAuthorityKind: 'NO_OTHER_WORKER',
        }}
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText('Needs authority: No other health worker available'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save medication' }));

    await waitFor(() =>
      expect(updateRequestMock).toHaveBeenCalledWith(
        PRICED_MEDICATION.id,
        expect.objectContaining({ midwifeAuthorityKind: 'NO_OTHER_WORKER' }),
      ),
    );
  });
});
