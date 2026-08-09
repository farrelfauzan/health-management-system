import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idOperationsMessages from '../../../messages/id/operations.json';

const sessionHealthMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/channel-gateway/channel-gateway', () => ({
  channelGatewayAdminControllerGetSessionHealthV1: sessionHealthMock,
  channelGatewayAdminControllerStartPairingV1: vi.fn(),
  getChannelGatewayAdminControllerGetSessionHealthV1QueryKey: () => ['whatsapp-session'],
}));

const { WhatsappSessionCard } = await import('./whatsapp-session-card');

function buildSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'GOWA',
    isConfigured: true,
    isConnected: true,
    isLoggedIn: true,
    checkedAt: '2026-08-09T03:12:00.000Z',
    ...overrides,
  };
}

function renderCard(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idOperationsMessages}>
        <WhatsappSessionCard />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('WhatsappSessionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a healthy session without offering to re-pair', async () => {
    sessionHealthMock.mockResolvedValue({ status: 200, data: { data: buildSession() } });

    renderCard();

    expect(await screen.findByText('Terhubung')).toBeInTheDocument();
    // A pairing button next to a healthy session is an invitation to log the
    // clinic out of WhatsApp by curiosity.
    expect(screen.queryByRole('button', { name: 'Pasangkan ulang' })).not.toBeInTheDocument();
  });

  it('surfaces a logged-out session as the state that needs a person', async () => {
    sessionHealthMock.mockResolvedValue({
      status: 200,
      data: { data: buildSession({ isLoggedIn: false }) },
    });

    renderCard();

    expect(await screen.findByText('Keluar — balasan tidak terkirim')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pasangkan ulang' })).toBeInTheDocument();
  });

  it('prefers the logout over the disconnection when both are true', async () => {
    sessionHealthMock.mockResolvedValue({
      status: 200,
      data: { data: buildSession({ isConnected: false, isLoggedIn: false }) },
    });

    renderCard();

    // The opposite order would tell an operator to wait for a reconnection
    // that can never happen without a QR scan.
    expect(await screen.findByText('Keluar — balasan tidak terkirim')).toBeInTheDocument();
    expect(screen.queryByText('Tidak terhubung')).not.toBeInTheDocument();
  });

  it('distinguishes a transient disconnection from a lost pairing', async () => {
    sessionHealthMock.mockResolvedValue({
      status: 200,
      data: { data: buildSession({ isConnected: false }) },
    });

    renderCard();

    expect(await screen.findByText('Tidak terhubung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pasangkan ulang' })).not.toBeInTheDocument();
  });

  it('says so plainly when no gateway is configured', async () => {
    sessionHealthMock.mockResolvedValue({
      status: 200,
      data: { data: buildSession({ isConfigured: false, isConnected: false, isLoggedIn: false }) },
    });

    renderCard();

    expect(await screen.findByText('Belum dikonfigurasi')).toBeInTheDocument();
  });
});
