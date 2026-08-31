import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/operations.json';

const getProfileMock = vi.hoisted(() => vi.fn());
const updateProfileMock = vi.hoisted(() => vi.fn());
const createLogoUploadUrlMock = vi.hoisted(() => vi.fn());
const putFileToSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/clinic-profile/clinic-profile', () => ({
  clinicProfileControllerGetClinicProfileV1: getProfileMock,
  clinicProfileControllerUpdateClinicProfileV1: updateProfileMock,
  clinicProfileControllerCreateLogoUploadUrlV1: createLogoUploadUrlMock,
  getClinicProfileControllerGetClinicProfileV1QueryKey: () => ['clinic-profile'],
}));

vi.mock('#lib/documents/put-file-to-signed-url', () => ({
  putFileToSignedUrl: putFileToSignedUrlMock,
}));

const { ClinicProfilePanel } = await import('./clinic-profile-panel');

const WRITE_RULES: AppRule[] = [
  { action: 'read', subject: 'ClinicProfile' },
  { action: 'write', subject: 'ClinicProfile' },
];
const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'ClinicProfile' }];

function buildProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama Indonesia',
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    hasLogo: false,
    updatedAt: '2026-09-18T02:15:00.000Z',
    ...overrides,
  };
}

function buildNotFoundError(): Error {
  // The shape `resolveApiErrorMessage`/`isAxiosError` recognise.
  return Object.assign(new Error('Not Found'), {
    isAxiosError: true,
    response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'not configured' } } },
  });
}

function renderPanel(rules: AppRule[] = WRITE_RULES): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
        <AbilityProvider ability={buildAppAbility(rules)}>
          <ClinicProfilePanel />
        </AbilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ClinicProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProfileMock.mockResolvedValue({ status: 200, data: { data: buildProfile() } });
    updateProfileMock.mockResolvedValue({ status: 200, data: { data: buildProfile() } });
  });

  it('renders the stored profile in the form', async () => {
    renderPanel();

    expect(await screen.findByLabelText('Clinic name')).toHaveValue('Klinik Sehat Bersama');
    expect(screen.getByLabelText('Tax ID (NPWP)')).toHaveValue('01.234.567.8-901.000');
  });

  it('shows an empty form rather than an error before the clinic is configured', async () => {
    // A 404 is the not-configured-yet state, not a failure.
    getProfileMock.mockRejectedValue(buildNotFoundError());

    renderPanel();

    expect(await screen.findByLabelText('Clinic name')).toHaveValue('');
    expect(screen.queryByText(/Unable to load the clinic profile/)).not.toBeInTheDocument();
  });

  it('reports a real load failure instead of an empty form', async () => {
    getProfileMock.mockRejectedValue(
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 500, data: {} } }),
    );

    renderPanel();

    expect(await screen.findByText(/Unable to load the clinic profile/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Clinic name')).not.toBeInTheDocument();
  });

  it('refuses to save without a clinic name', async () => {
    getProfileMock.mockResolvedValue({ status: 200, data: { data: buildProfile({ name: '' }) } });

    renderPanel();

    expect(await screen.findByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('sends an emptied optional field as null so the column is cleared', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Clinic name');

    await user.clear(screen.getByLabelText('Tax ID (NPWP)'));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    // `null`, never `''` — the API's three-state PATCH treats them differently
    // and a blank string would print as an empty line on an invoice.
    expect(updateProfileMock.mock.calls[0]?.[0]).toMatchObject({
      name: 'Klinik Sehat Bersama',
      taxId: null,
    });
  });

  it('omits logoStorageKey entirely when the logo was not touched', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Clinic name');

    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(updateProfileMock.mock.calls[0]?.[0]).not.toHaveProperty('logoStorageKey');
  });

  it('stages a logo upload and claims it with the save', async () => {
    const user = userEvent.setup();
    createLogoUploadUrlMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          url: 'https://storage.example/put',
          storageKey: 'clinic-profile/logo/staged/2f1c8e0a-9b3d-4f77-b0a1-6d5e4c3b2a19',
          expiresAt: '2026-09-18T02:20:00.000Z',
          requiredHeaders: { 'Content-Type': 'image/png' },
        },
      },
    });
    putFileToSignedUrlMock.mockResolvedValue(undefined);
    renderPanel();
    await screen.findByLabelText('Clinic name');

    await user.upload(
      screen.getByLabelText('Logo'),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(putFileToSignedUrlMock).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(createLogoUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
    );
    expect(updateProfileMock.mock.calls[0]?.[0]).toMatchObject({
      logoStorageKey: 'clinic-profile/logo/staged/2f1c8e0a-9b3d-4f77-b0a1-6d5e4c3b2a19',
    });
  });

  it('refuses a file type this surface does not accept, without contacting the API', async () => {
    // `applyAccept: false` on purpose: the input's `accept` attribute is a
    // picker hint, and an OS dialog set to "All files" — or a renamed file —
    // walks straight past it. This is the check behind that hint.
    const user = userEvent.setup({ applyAccept: false });
    renderPanel();
    await screen.findByLabelText('Clinic name');

    await user.upload(
      screen.getByLabelText('Logo'),
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
    );

    expect(await screen.findByText('Choose a JPEG, PNG, or WebP image.')).toBeInTheDocument();
    expect(createLogoUploadUrlMock).not.toHaveBeenCalled();
  });

  it('hides the save action from a reader who cannot write', async () => {
    renderPanel(READ_ONLY_RULES);

    expect(await screen.findByLabelText('Clinic name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument();
  });
});
