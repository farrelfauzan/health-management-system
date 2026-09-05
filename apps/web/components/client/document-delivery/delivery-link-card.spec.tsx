import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryLinkCard } from './delivery-link-card';
import { deliveryLinkPublicControllerResolveLinkV1 } from '#lib/api/generated/invoice-delivery/invoice-delivery';
import messages from '../../../messages/id/auth-shell.json';

vi.mock('#lib/api/generated/invoice-delivery/invoice-delivery', () => ({
  deliveryLinkPublicControllerResolveLinkV1: vi.fn(),
  getDeliveryLinkPublicControllerResolveLinkV1QueryKey: (token: string) => [
    `/api/v1/delivery-links/${token}`,
  ],
}));

const resolveMock = vi.mocked(deliveryLinkPublicControllerResolveLinkV1);
const TOKEN = 'A'.repeat(43);

function buildStatusError(status: number): AxiosError {
  return new AxiosError('Refused', String(status), undefined, undefined, {
    status,
    statusText: 'Refused',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {
      error: { code: 'DELIVERY_LINK_UNAVAILABLE', message: 'This link is no longer valid.' },
    },
  });
}

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <DeliveryLinkCard token={TOKEN} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DeliveryLinkCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the presigned download once the token resolves', async () => {
    resolveMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          url: 'https://storage.example/signed',
          fileName: 'INV-2026-09-000123.pdf',
          expiresAt: '2026-09-29T08:05:00.000Z',
        },
      },
    } as never);

    renderCard();

    const link = await screen.findByRole('link', { name: /Unduh INV-2026-09-000123.pdf/ });
    expect(link).toHaveAttribute('href', 'https://storage.example/signed');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(resolveMock).toHaveBeenCalledWith(TOKEN, expect.anything());
  });

  it('reads a dead link as no longer valid, in Indonesian, without saying why', async () => {
    resolveMock.mockRejectedValue(buildStatusError(404));

    renderCard();

    expect(await screen.findByText('Tautan ini sudah tidak berlaku')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tautan mungkin sudah kedaluwarsa, dicabut oleh klinik, atau dokumennya sudah tidak tersedia.',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('tells the patient to wait when rate-limited', async () => {
    resolveMock.mockRejectedValue(buildStatusError(429));

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.',
    );
  });
});
