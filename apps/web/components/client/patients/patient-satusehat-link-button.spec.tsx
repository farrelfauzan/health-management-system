import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const { linkPatientMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  linkPatientMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('#lib/api/generated/satusehat/satusehat', () => ({
  satusehatLinkControllerLinkPatientV1: (patientId: string) => linkPatientMock(patientId),
}));

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return {
    ...actual,
    toast: { error: toastErrorMock, success: toastSuccessMock },
  };
});

const { PatientSatusehatLinkButton } = await import('./patient-satusehat-link-button');

const LINK_RULES: AppRule[] = [{ action: 'link', subject: 'Satusehat' }];

function renderButton(options: {
  rules?: AppRule[];
  hasNik?: boolean;
  isLinked?: boolean;
  isSatusehatEnabled?: boolean;
}): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <AbilityProvider ability={buildAppAbility(options.rules ?? LINK_RULES)}>
          <PatientSatusehatLinkButton
            patientId="patient-1"
            hasNik={options.hasNik ?? true}
            isLinked={options.isLinked ?? false}
            isSatusehatEnabled={options.isSatusehatEnabled ?? true}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function buildAxiosErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError('request failed');
  error.response = {
    status,
    statusText: '',
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('PatientSatusehatLinkButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkPatientMock.mockResolvedValue({ status: 200, data: {} });
  });

  it('offers the link when the patient has a NIK and is not linked', () => {
    renderButton({});

    expect(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ })).toBeEnabled();
  });

  it('renders nothing without the link permission', () => {
    renderButton({ rules: [] });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the clinic does not have the SATUSEHAT entitlement', () => {
    renderButton({ isSatusehatEnabled: false });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing once the patient is linked — there is nothing left to do', () => {
    renderButton({ isLinked: true });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables the button without a NIK, since the lookup has nothing to search on', () => {
    renderButton({ hasNik: false });

    expect(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ })).toBeDisabled();
  });

  it.each([
    [422, 'NIK belum diisi. Lengkapi dulu sebelum menautkan.'],
    [404, 'NIK tidak ditemukan di SATUSEHAT — periksa nomornya.'],
    [409, 'Lebih dari satu kecocokan — verifikasi pasien di portal SATUSEHAT dulu.'],
    [503, 'Integrasi SATUSEHAT belum dikonfigurasi.'],
    [502, 'SATUSEHAT tidak dapat dihubungi. Coba lagi.'],
  ])('shows the %s copy', async (status, expectedMessage) => {
    linkPatientMock.mockRejectedValue(buildAxiosErrorWithStatus(status));
    renderButton({});

    await userEvent.click(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expectedMessage));
  });

  it('confirms the link on success', async () => {
    renderButton({});

    await userEvent.click(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Pasien tertaut ke SATUSEHAT.'));
    expect(linkPatientMock).toHaveBeenCalledWith('patient-1');
  });
});
