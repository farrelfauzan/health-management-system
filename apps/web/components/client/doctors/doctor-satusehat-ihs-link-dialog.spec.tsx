import type { SatusehatDoctorIhsPreview } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const { previewMock, linkMock, toastSuccessMock } = vi.hoisted(() => ({
  previewMock: vi.fn(),
  linkMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('#lib/api/generated/satusehat/satusehat', () => ({
  satusehatLinkControllerPreviewDoctorIhsLinkV1: (doctorId: string, body: unknown) =>
    previewMock(doctorId, body),
  satusehatLinkControllerLinkDoctorByIhsV1: (doctorId: string, body: unknown) =>
    linkMock(doctorId, body),
}));

vi.mock('#lib/doctors/invalidate-doctor-queries', () => ({
  invalidateDoctorQueries: vi.fn(),
}));

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return { ...actual, toast: { error: vi.fn(), success: toastSuccessMock } };
});

const { DoctorSatusehatIhsLinkDialog } = await import('./doctor-satusehat-ihs-link-dialog');

function buildPreview(
  overrides: Partial<SatusehatDoctorIhsPreview> = {},
): SatusehatDoctorIhsPreview {
  return {
    doctorId: 'doctor-1',
    ihsNumber: '10000000009',
    doctorName: 'dr. Budi Santoso',
    satusehatName: 'dr. Budi Santoso, Sp.PD',
    nikSuffixCheck: 'MATCHES',
    alreadyLinked: false,
    ...overrides,
  };
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

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <DoctorSatusehatIhsLinkDialog doctorId="doctor-1" open onOpenChange={onOpenChange} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange };
}

async function checkIhsNumber(value: string): Promise<void> {
  await userEvent.type(screen.getByLabelText('Nomor IHS SATUSEHAT'), value);
  await userEvent.click(screen.getByRole('button', { name: 'Periksa' }));
}

describe('DoctorSatusehatIhsLinkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the SATUSEHAT name beside ours before anything is saved', async () => {
    previewMock.mockResolvedValue({ status: 200, data: { data: buildPreview() } });
    renderDialog();

    await checkIhsNumber('10000000009');

    expect(previewMock).toHaveBeenCalledWith('doctor-1', { ihsNumber: '10000000009' });
    expect(await screen.findByText('dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('dr. Budi Santoso, Sp.PD')).toBeInTheDocument();
    expect(linkMock).not.toHaveBeenCalled();
  });

  it('links the previewed number on confirmation', async () => {
    previewMock.mockResolvedValue({ status: 200, data: { data: buildPreview() } });
    linkMock.mockResolvedValue({ status: 200, data: {} });
    const { onOpenChange } = renderDialog();

    await checkIhsNumber('10000000009');
    await userEvent.click(await screen.findByRole('button', { name: 'Konfirmasi dan tautkan' }));

    expect(linkMock).toHaveBeenCalledWith('doctor-1', { ihsNumber: '10000000009' });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks confirmation when the NIK digits prove a different person', async () => {
    previewMock.mockResolvedValue({
      status: 200,
      data: { data: buildPreview({ nikSuffixCheck: 'DIFFERS' }) },
    });
    renderDialog();

    await checkIhsNumber('10000000009');

    expect(await screen.findByText(/Nomor IHS ini milik orang lain/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konfirmasi dan tautkan' })).toBeDisabled();
  });

  it('says when SATUSEHAT has no practitioner under the number', async () => {
    previewMock.mockRejectedValue(buildAxiosErrorWithStatus(404));
    renderDialog();

    await checkIhsNumber('99999999999');

    expect(
      await screen.findByText(/SATUSEHAT tidak memiliki tenaga kesehatan dengan nomor IHS ini/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konfirmasi dan tautkan' })).toBeDisabled();
  });
});
