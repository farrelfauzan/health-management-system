import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpecialtyPanel } from './specialty-panel';
import operationsMessages from '../../../messages/id/operations.json';

const { listMock, createMock, updateMock, notifyStatementMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  notifyStatementMock: vi.fn(),
}));

vi.mock('#lib/api/generated/specialty/specialty', () => ({
  specialtyControllerListSpecialtiesV1: listMock,
  getSpecialtyControllerListSpecialtiesV1QueryKey: (params?: object) =>
    ['/api/v1/specialties', ...(params ? [params] : [])],
  specialtyControllerCreateSpecialtyV1: createMock,
  specialtyControllerUpdateSpecialtyV1: updateMock,
}));

vi.mock('#lib/api/notify-statement', () => ({ notifyStatement: notifyStatementMock }));

const KEBIDANAN = {
  id: '4f0f4be2-6d51-4bfb-a4c8-2f6a1de1a001',
  name: 'Kebidanan',
  isActive: true,
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

const MANAGE_RULES: AppRule[] = [{ action: 'manage', subject: 'Specialty' }];

function respondWith(data: unknown) {
  return { status: 200, headers: {}, data: { data } };
}

function buildRefusal(code: string, details?: unknown): Error {
  return Object.assign(new Error('Conflict'), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message: 'refused', details } } },
  });
}

function renderPanel(rules: AppRule[] = MANAGE_RULES): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider ability={buildAppAbility(rules)}>
        <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
          <SpecialtyPanel />
        </NextIntlClientProvider>
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe('SpecialtyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue(respondWith([KEBIDANAN]));
  });

  it('lists every poli and offers the controls to an administrator', async () => {
    renderPanel();

    expect(await screen.findByText('Kebidanan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah poli' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nonaktifkan' })).toBeInTheDocument();
  });

  it('hides the controls from someone who may only look', async () => {
    renderPanel([{ action: 'read', subject: 'Doctor' }]);

    expect(await screen.findByText('Kebidanan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tambah poli' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument();
  });

  it('adds a poli by name', async () => {
    createMock.mockResolvedValue(respondWith({ ...KEBIDANAN, id: 'new', name: 'Poli Gizi' }));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kebidanan');

    await user.click(screen.getByRole('button', { name: 'Tambah poli' }));
    await user.type(screen.getByLabelText(/Nama poli/), '  Poli Gizi ');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({ name: 'Poli Gizi' }));
  });

  it('says in Indonesian why a poli still in use cannot be deactivated', async () => {
    updateMock.mockRejectedValue(
      buildRefusal('SPECIALTY_IN_USE', { activeClinicianCount: 2, activeTariffCount: 1 }),
    );
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kebidanan');

    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }));

    await waitFor(() =>
      expect(notifyStatementMock).toHaveBeenCalledWith({
        tone: 'error',
        title:
          'Poli ini tidak dapat dinonaktifkan karena masih dipakai 2 dokter/bidan aktif dan 1 tarif aktif. Pindahkan atau nonaktifkan terlebih dahulu.',
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(KEBIDANAN.id, { isActive: false });
  });

  it('says in Indonesian that a name is already taken', async () => {
    updateMock.mockRejectedValue(buildRefusal('SPECIALTY_NAME_TAKEN'));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Kebidanan');

    await user.click(screen.getByRole('button', { name: 'Ubah' }));
    const nameInput = screen.getByLabelText(/Nama poli/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Poli Umum');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nama poli ini sudah dipakai poli lain.',
    );
  });
});
