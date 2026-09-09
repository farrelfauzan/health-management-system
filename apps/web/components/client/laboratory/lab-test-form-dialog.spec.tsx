import type { LabTestView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LabTestFormDialog } from './lab-test-form-dialog';
import operationsMessages from '../../../messages/id/operations.json';

const catalogMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  replaceRanges: vi.fn(),
}));

const tariffMocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('#lib/api/generated/laboratory-catalog/laboratory-catalog', () => ({
  labTestControllerCreateLabTestV1: catalogMocks.create,
  labTestControllerUpdateLabTestV1: catalogMocks.update,
  labTestControllerReplaceReferenceRangesV1: catalogMocks.replaceRanges,
}));

vi.mock('#lib/api/generated/service-tariffs/service-tariffs', () => ({
  serviceTariffControllerListServiceTariffsV1: tariffMocks.list,
  getServiceTariffControllerListServiceTariffsV1QueryKey: (params: unknown) => [
    '/api/v1/service-tariffs',
    params,
  ],
}));

const TARIFF_ID = '9d2e4f60-7b8c-4c9d-a0e1-4f5a6b7c8d9e';

function buildLabTest(overrides: Partial<LabTestView> = {}): LabTestView {
  return {
    id: 'test-1',
    code: 'HB',
    name: 'Hemoglobin',
    loincCode: '718-7',
    loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
    specimenType: 'WHOLE_BLOOD',
    resultType: 'NUMERIC',
    unit: 'g/dL',
    decimals: 1,
    codedOptions: [],
    isActive: true,
    serviceTariffId: TARIFF_ID,
    price: 35000,
    referenceRanges: [{ id: 'r1', sex: 'FEMALE', low: 12, high: 16 }],
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    ...overrides,
  };
}

function buildEnvelope<TData>(data: TData, status = 200) {
  return { status, headers: {}, data: { data } };
}

function renderDialog(labTest: LabTestView | null): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
        <LabTestFormDialog open labTest={labTest} onOpenChange={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * P18-T15. The catalog's only write surface: what it refuses before sending,
 * which fields a result type shows, and that a save reaches the test and its
 * bands as two writes.
 */
describe('LabTestFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tariffMocks.list.mockResolvedValue(buildEnvelope([]) as never);
    catalogMocks.create.mockResolvedValue(buildEnvelope(buildLabTest()) as never);
    catalogMocks.update.mockResolvedValue(buildEnvelope(buildLabTest()) as never);
    catalogMocks.replaceRanges.mockResolvedValue(buildEnvelope(buildLabTest()) as never);
  });

  it('refuses to save without a code and a name', async () => {
    renderDialog(null);

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kode dan nama wajib diisi.');
    expect(catalogMocks.create).not.toHaveBeenCalled();
  });

  it('shows the unit for a numeric test and the answer options only for a coded one', () => {
    renderDialog(buildLabTest());

    expect(screen.getByTestId('lab-test-unit')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-test-coded-options')).not.toBeInTheDocument();
  });

  it('shows the answer options for a coded test and no unit', () => {
    renderDialog(
      buildLabTest({
        resultType: 'CODED',
        unit: undefined,
        codedOptions: ['Negatif', 'Positif'],
        referenceRanges: [],
      }),
    );

    expect(screen.getByTestId('lab-test-coded-options')).toHaveValue('Negatif\nPositif');
    expect(screen.queryByTestId('lab-test-unit')).not.toBeInTheDocument();
  });

  // The SATUSEHAT chain skips and gap-reports an uncoded test; the form says
  // so rather than let it pass silently.
  it('warns that a test without a LOINC is not reported, until one is typed', async () => {
    renderDialog(buildLabTest({ loincCode: undefined, loincDisplay: undefined }));

    expect(screen.getByTestId('lab-test-loinc-hint')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('718-7'), '718-7');

    expect(screen.queryByTestId('lab-test-loinc-hint')).not.toBeInTheDocument();
  });

  it('refuses overlapping bands for one sex and age before anything is sent', async () => {
    renderDialog(
      buildLabTest({
        referenceRanges: [
          { id: 'r1', sex: 'FEMALE', low: 12, high: 16 },
          { id: 'r2', sex: 'FEMALE', low: 11, high: 15 },
        ],
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByTestId('lab-reference-ranges-error')).toHaveTextContent(
      'Rentang 1 dan 2 tumpang tindih',
    );
    expect(catalogMocks.update).not.toHaveBeenCalled();
    expect(catalogMocks.replaceRanges).not.toHaveBeenCalled();
  });

  it('saves the test with its tariff, then replaces its bands as one set', async () => {
    renderDialog(buildLabTest());

    await userEvent.clear(screen.getByPlaceholderText('HB'));
    await userEvent.type(screen.getByPlaceholderText('HB'), 'HGB');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(catalogMocks.update).toHaveBeenCalledWith(
        'test-1',
        expect.objectContaining({
          code: 'HGB',
          name: 'Hemoglobin',
          unit: 'g/dL',
          decimals: 1,
          serviceTariffId: TARIFF_ID,
          isActive: true,
        }),
      ),
    );
    expect(catalogMocks.replaceRanges).toHaveBeenCalledWith('test-1', {
      ranges: [
        {
          sex: 'FEMALE',
          ageMinDays: null,
          ageMaxDays: null,
          low: 12,
          high: 16,
          criticalLow: null,
          criticalHigh: null,
          textNormal: null,
        },
      ],
    });
  });

  it('surfaces the API’s conflict as its own sentence rather than a generic failure', async () => {
    catalogMocks.update.mockResolvedValue({
      status: 409,
      headers: {},
      data: { error: { code: 'CONFLICT', message: 'A lab test with code HGB already exists' } },
    } as never);
    renderDialog(buildLabTest());

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A lab test with code HGB already exists',
    );
  });
});
