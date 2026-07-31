import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

const listConfigsMock = vi.hoisted(() => vi.fn());
const activateConfigMock = vi.hoisted(() => vi.fn());
const testConnectionMock = vi.hoisted(() => vi.fn());
const deleteConfigMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/ai-chatbot/ai-chatbot', () => ({
  aiProviderControllerListConfigsV1: listConfigsMock,
  aiProviderControllerActivateConfigV1: activateConfigMock,
  aiProviderControllerTestConnectionV1: testConnectionMock,
  aiProviderControllerDeleteConfigV1: deleteConfigMock,
  aiProviderControllerCreateConfigV1: vi.fn(),
  aiProviderControllerUpdateConfigV1: vi.fn(),
  getAiProviderControllerListConfigsV1QueryKey: () => ['ai-providers'],
}));

const { AiProvidersPanel } = await import('./ai-providers-panel');

function buildConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'config-1',
    providerKind: 'DEEPSEEK',
    displayName: 'Clinic DeepSeek',
    hasApiKey: true,
    apiKeyHint: 'x7Kp',
    baseUrl: null,
    defaultModel: 'deepseek-chat',
    isActive: false,
    isEnabled: true,
    maxTokens: 2048,
    timeoutMs: 30000,
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(canWrite = true): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
        <AiProvidersPanel canWrite={canWrite} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AiProvidersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConfigsMock.mockResolvedValue({ status: 200, data: { data: [buildConfig()] } });
  });

  it('shows only the masked hint, never a key', async () => {
    renderPanel();

    expect(await screen.findByText('••••x7Kp')).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
  });

  it('offers activate for a staged config and test for the active one', async () => {
    listConfigsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildConfig(), buildConfig({ id: 'config-2', isActive: true })] },
    });
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Aktifkan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uji' })).toBeInTheDocument();
  });

  it('disables delete for the active config, because the API refuses it', async () => {
    listConfigsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildConfig({ isActive: true })] },
    });
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Hapus' })).toBeDisabled();
  });

  it('reports a failed connection test with the provider’s own reason', async () => {
    const user = userEvent.setup();
    listConfigsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildConfig({ isActive: true })] },
    });
    testConnectionMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          isSuccessful: false,
          message: 'AI_PROVIDER_UNAUTHORIZED: provider rejected the API key',
          testedAt: '2026-08-14T00:00:00.000Z',
        },
      },
    });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Uji' }));

    // A failed test is a 200 carrying the reason — it must surface as the
    // reason, not as a generic error.
    expect(
      await screen.findByText(/AI_PROVIDER_UNAUTHORIZED: provider rejected the API key/),
    ).toBeInTheDocument();
  });

  it('hides every mutating control from a read-only holder', async () => {
    renderPanel(false);

    expect(await screen.findByText('Clinic DeepSeek')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tambah penyedia' })).not.toBeInTheDocument();
  });

  it('renders an empty state when no provider is configured', async () => {
    listConfigsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPanel();

    expect(await screen.findByText(/Belum ada penyedia yang dikonfigurasi/)).toBeInTheDocument();
  });
});
