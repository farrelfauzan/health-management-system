import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const { getStatusMock, startSessionMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
  startSessionMock: vi.fn(),
}));

vi.mock('#lib/api/generated/satusehat/satusehat', () => ({
  satusehatKycControllerGetStatusV1: () => getStatusMock(),
  getSatusehatKycControllerGetStatusV1QueryKey: () => ['/api/v1/satusehat/kyc/status'],
  satusehatKycControllerStartSessionV1: (body: unknown) => startSessionMock(body),
}));

vi.mock('#components/client/patients/patient-kyc-dialog', () => ({
  PatientKycDialog: ({ url }: { url: string | null }) =>
    url ? <div data-testid="kyc-dialog">{url}</div> : null,
}));

const { PatientKycVerifyButton } = await import('./patient-kyc-verify-button');

const VERIFY_RULES: AppRule[] = [{ action: 'verify', subject: 'SatusehatKyc' }];
const VALIDATION_URL = 'https://kyc.example/validate?token=abc';

function mockStatus(status: {
  isEnabled: boolean;
  disabledReason: string | null;
  hasOperatorNik: boolean;
}): void {
  getStatusMock.mockResolvedValue({ status: 200, headers: {}, data: { data: status } });
}

function renderButton(options: { rules?: AppRule[]; isSatusehatEnabled?: boolean } = {}): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <AbilityProvider ability={buildAppAbility(options.rules ?? VERIFY_RULES)}>
          <PatientKycVerifyButton
            patientId="patient-1"
            isSatusehatEnabled={options.isSatusehatEnabled ?? true}
          />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PatientKycVerifyButton (P24-T16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus({ isEnabled: true, disabledReason: null, hasOperatorNik: true });
    startSessionMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: { url: VALIDATION_URL, expiresAt: null } },
    });
  });

  it('renders nothing without the SATUSEHAT entitlement', () => {
    renderButton({ isSatusehatEnabled: false });

    expect(screen.queryByRole('button', { name: /Verifikasi SATUSEHAT/ })).toBeNull();
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it('renders nothing without the verify grant', () => {
    renderButton({ rules: [{ action: 'link', subject: 'Satusehat' }] });

    expect(screen.queryByRole('button', { name: /Verifikasi SATUSEHAT/ })).toBeNull();
  });

  it('starts a session with the patient id and hands the URL to the dialog', async () => {
    renderButton();
    const button = await screen.findByRole('button', { name: 'Verifikasi SATUSEHAT' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);

    await waitFor(() => expect(startSessionMock).toHaveBeenCalledWith({ patientId: 'patient-1' }));
    expect(await screen.findByTestId('kyc-dialog')).toHaveTextContent(VALIDATION_URL);
  });

  it('is disabled with the no-NIK copy when the operator has no NIK', async () => {
    mockStatus({ isEnabled: false, disabledReason: 'OPERATOR_NIK_MISSING', hasOperatorNik: false });
    renderButton();

    expect(
      await screen.findByText('Tambahkan NIK Anda di profil untuk memverifikasi pasien'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifikasi SATUSEHAT' })).toBeDisabled();
  });

  it('is disabled with the keys copy when the deployment has no KYC keys', async () => {
    mockStatus({
      isEnabled: false,
      disabledReason: 'KYC_KEYS_NOT_CONFIGURED',
      hasOperatorNik: true,
    });
    renderButton();

    expect(
      await screen.findByText('Kunci KYC SATUSEHAT belum dikonfigurasi. Hubungi administrator.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifikasi SATUSEHAT' })).toBeDisabled();
  });

  it('is disabled with the not-configured copy when SATUSEHAT itself is unconfigured', async () => {
    mockStatus({
      isEnabled: false,
      disabledReason: 'SATUSEHAT_NOT_CONFIGURED',
      hasOperatorNik: true,
    });
    renderButton();

    expect(await screen.findByText('Integrasi SATUSEHAT belum dikonfigurasi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verifikasi SATUSEHAT' })).toBeDisabled();
  });
});
