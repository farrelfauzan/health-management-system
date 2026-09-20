import type { TaxSettingsView } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const updateTaxSettingsMock = vi.fn();

vi.mock('#lib/api/generated/tax-settings/tax-settings', () => ({
  taxSettingsControllerUpdateTaxSettingsV1: (...args: unknown[]) => updateTaxSettingsMock(...args),
  getTaxSettingsControllerGetTaxSettingsV1QueryKey: () => ['/api/v1/tax/settings'],
}));

const { TaxSettingsForm } = await import('./tax-settings-form');

const DEFAULT_SETTINGS: TaxSettingsView = {
  incomeTaxRegime: 'GENERAL',
  isPkp: false,
  npwp: '0012345678901000',
  npwpStatus: 'VALID',
};

function buildApiError(code: string): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Bad Request', '400', { headers }, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers,
    config: { headers },
    data: { error: { code, message: 'refused' } },
  });
}

function buildValidationError(details: unknown, code = 'BAD_REQUEST'): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Bad Request', '400', { headers }, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers,
    config: { headers },
    data: { error: { code, message: 'Validation failed', details } },
  });
}

function renderForm(settings: TaxSettingsView = DEFAULT_SETTINGS): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <TaxSettingsForm settings={settings} canWrite />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaxSettingsForm (P27-T02, D-038)', () => {
  beforeEach(() => {
    updateTaxSettingsMock.mockReset();
  });

  it('keeps save disabled until something changes', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Simpan profil pajak' })).toBeDisabled();
  });

  it('sends only the field the administrator changed', async () => {
    updateTaxSettingsMock.mockResolvedValue({ data: DEFAULT_SETTINGS });
    renderForm();

    fireEvent.change(screen.getByLabelText('NITKU'), {
      target: { value: '0012345678901000000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil pajak' }));

    await waitFor(() => expect(updateTaxSettingsMock).toHaveBeenCalledTimes(1));
    expect(updateTaxSettingsMock.mock.calls[0]?.[0]).toEqual({
      nitku: '0012345678901000000000',
    });
  });

  it('asks for the registration date once the clinic is marked PKP', () => {
    renderForm();

    fireEvent.click(screen.getByRole('checkbox', { name: /Klinik berstatus PKP/ }));

    expect(screen.getByText('PKP sejak')).toBeInTheDocument();
  });

  it('explains a PP 55 refusal in the reader language', async () => {
    updateTaxSettingsMock.mockRejectedValue(buildApiError('TAX_PP55_NOT_ELIGIBLE'));
    renderForm();

    fireEvent.change(screen.getByLabelText('NITKU'), {
      target: { value: '0012345678901000000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil pajak' }));

    expect(
      await screen.findByText(/tidak dapat memakai PP 55 dengan tahun mulai tersebut/),
    ).toBeInTheDocument();
  });

  it('shows a rejected NITKU under the NITKU box, not as a bare "validation failed"', async () => {
    updateTaxSettingsMock.mockRejectedValue(
      buildValidationError([
        { code: 'custom', message: 'NITKU must be 22 digits', path: ['nitku'] },
      ]),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText('NITKU'), { target: { value: '001234567890100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil pajak' }));

    expect(await screen.findByText('NITKU must be 22 digits')).toBeInTheDocument();
    expect(screen.getByLabelText('NITKU')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
  });

  it('prefers its own wording for a refusal it knows, still under that field', async () => {
    updateTaxSettingsMock.mockRejectedValue(
      buildValidationError(
        { nitku: "The first 16 digits of the NITKU must be the clinic's NPWP" },
        'TAX_NITKU_NPWP_MISMATCH',
      ),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText('NITKU'), {
      target: { value: '9912345678901000000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil pajak' }));

    expect(await screen.findByText(/NITKU harus diawali NPWP 16 digit klinik/)).toBeInTheDocument();
  });

  it('clears a field refusal as soon as that field is edited again', async () => {
    updateTaxSettingsMock.mockRejectedValue(
      buildValidationError([
        { code: 'custom', message: 'NITKU must be 22 digits', path: ['nitku'] },
      ]),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText('NITKU'), { target: { value: '001234567890100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan profil pajak' }));
    expect(await screen.findByText('NITKU must be 22 digits')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('NITKU'), {
      target: { value: '0012345678901000000000' },
    });

    await waitFor(() =>
      expect(screen.queryByText('NITKU must be 22 digits')).not.toBeInTheDocument(),
    );
  });

  it('shows the start year and its last eligible year for a PT on PP 55', () => {
    // The preview judges against today's year; pin it so the case does not expire.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-19T03:00:00.000Z'));
    renderForm({
      ...DEFAULT_SETTINGS,
      taxpayerType: 'PT',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2025,
    });

    expect(screen.getByLabelText('Tahun pertama memakai tarif 0,5%')).toHaveValue('2025');
    expect(screen.getByText('Boleh memakai tarif 0,5% sampai akhir 2027.')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
