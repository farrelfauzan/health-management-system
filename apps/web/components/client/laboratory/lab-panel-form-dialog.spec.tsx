import type { LabPanelView, LabTestView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LabPanelFormDialog } from './lab-panel-form-dialog';
import operationsMessages from '../../../messages/id/operations.json';

const catalogMocks = vi.hoisted(() => ({
  createPanel: vi.fn(),
  updatePanel: vi.fn(),
  listTests: vi.fn(),
}));

const tariffMocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('#lib/api/generated/laboratory-catalog/laboratory-catalog', () => ({
  labPanelControllerCreateLabPanelV1: catalogMocks.createPanel,
  labPanelControllerUpdateLabPanelV1: catalogMocks.updatePanel,
  labTestControllerListLabTestsV1: catalogMocks.listTests,
  getLabTestControllerListLabTestsV1QueryKey: (params: unknown) => ['/api/v1/lab-tests', params],
}));

vi.mock('#lib/api/generated/service-tariffs/service-tariffs', () => ({
  serviceTariffControllerListServiceTariffsV1: tariffMocks.list,
  getServiceTariffControllerListServiceTariffsV1QueryKey: (params: unknown) => [
    '/api/v1/service-tariffs',
    params,
  ],
}));

function buildLabTest(id: string, code: string, name: string, isActive = true): LabTestView {
  return {
    id,
    code,
    name,
    specimenType: 'WHOLE_BLOOD',
    resultType: 'NUMERIC',
    unit: 'g/dL',
    decimals: 1,
    codedOptions: [],
    isActive,
    referenceRanges: [],
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  };
}

const HB = buildLabTest('t-hb', 'HB', 'Hemoglobin');
const LEU = buildLabTest('t-leu', 'LEU', 'Leukosit');
const RETIRED = buildLabTest('t-old', 'OLD', 'Pemeriksaan lama', false);

function buildPanel(): LabPanelView {
  return {
    id: 'panel-1',
    code: 'DL',
    name: 'Darah Lengkap',
    isActive: true,
    members: [
      {
        labTestId: 't-leu',
        code: 'LEU',
        name: 'Leukosit',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        sortOrder: 0,
      },
      {
        labTestId: 't-hb',
        code: 'HB',
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        sortOrder: 1,
      },
    ],
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  };
}

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

function renderDialog(labPanel: LabPanelView | null): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
        <LabPanelFormDialog open labPanel={labPanel} onOpenChange={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * P18-T15. A panel is its members in report order; the dialog offers only
 * active tests for new picks and sends the order as picked.
 */
describe('LabPanelFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tariffMocks.list.mockResolvedValue(buildEnvelope([]) as never);
    catalogMocks.listTests.mockResolvedValue(buildEnvelope([HB, LEU, RETIRED]) as never);
    catalogMocks.createPanel.mockResolvedValue(buildEnvelope(buildPanel()) as never);
    catalogMocks.updatePanel.mockResolvedValue(buildEnvelope(buildPanel()) as never);
  });

  it('refuses a panel with no members', async () => {
    renderDialog(null);

    await userEvent.type(screen.getByPlaceholderText('DL'), 'DL');
    await userEvent.type(screen.getByLabelText(/^Nama\b/), 'Darah Lengkap');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Paket memerlukan setidaknya satu pemeriksaan.',
    );
    expect(catalogMocks.createPanel).not.toHaveBeenCalled();
  });

  it('offers only active tests and posts the members in the order they were picked', async () => {
    const user = userEvent.setup();
    renderDialog(null);

    await user.type(screen.getByPlaceholderText('DL'), 'DL');
    await user.type(screen.getByLabelText(/^Nama\b/), 'Darah Lengkap');
    // The members picker is the first combobox on the form; the tariff picker follows it.
    await user.click(screen.getAllByRole('combobox')[0] as HTMLElement);
    expect(screen.queryByText('Pemeriksaan lama')).not.toBeInTheDocument();
    await user.click(await screen.findByText('Leukosit'));
    await user.click(screen.getByText('Hemoglobin'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(catalogMocks.createPanel).toHaveBeenCalledWith({
        code: 'DL',
        name: 'Darah Lengkap',
        labTestIds: ['t-leu', 't-hb'],
        isActive: true,
        serviceTariffId: null,
      }),
    );
  });

  it('keeps an existing panel’s member order on edit', async () => {
    renderDialog(buildPanel());

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(catalogMocks.updatePanel).toHaveBeenCalledWith(
        'panel-1',
        expect.objectContaining({ labTestIds: ['t-leu', 't-hb'] }),
      ),
    );
  });
});
