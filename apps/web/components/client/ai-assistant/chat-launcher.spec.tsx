import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

const getAvailabilityMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/ai-chatbot/ai-chatbot', () => ({
  chatControllerGetAvailabilityV1: getAvailabilityMock,
  getChatControllerGetAvailabilityV1QueryKey: () => ['chat', 'availability'],
}));
vi.mock('next/navigation', () => ({ usePathname: usePathnameMock }));

const { ChatLauncher } = await import('./chat-launcher');

function renderLauncher(canChat = true): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppAbilityProvider rules={canChat ? [{ action: 'create', subject: 'ChatSession' }] : []}>
        <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
          <ChatLauncher />
        </NextIntlClientProvider>
      </AppAbilityProvider>
    </QueryClientProvider>,
  );
}

describe('ChatLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/admin/dashboard');
    getAvailabilityMock.mockResolvedValue({
      status: 200,
      data: { data: { isAvailable: true, isEnabled: true, hasActiveProvider: true } },
    });
  });

  it('shows the entry point when chat is available', async () => {
    renderLauncher();

    expect(await screen.findByRole('link', { name: 'Buka asisten AI' })).toBeInTheDocument();
  });

  it('stays hidden while availability is still unknown', () => {
    renderLauncher();

    // Rendering optimistically would make the button flash in and out on
    // every page load.
    expect(screen.queryByRole('link', { name: 'Buka asisten AI' })).not.toBeInTheDocument();
  });

  it.each([
    ['the clinic has chat switched off', { isAvailable: false, isEnabled: false, hasActiveProvider: false }],
    ['no provider is active', { isAvailable: false, isEnabled: true, hasActiveProvider: false }],
  ])('stays hidden when %s', async (_reason, availability) => {
    getAvailabilityMock.mockResolvedValue({ status: 200, data: { data: availability } });
    renderLauncher();

    await waitFor(() => expect(getAvailabilityMock).toHaveBeenCalled());
    // An entry point that leads straight to an empty state is worse than none.
    expect(screen.queryByRole('link', { name: 'Buka asisten AI' })).not.toBeInTheDocument();
  });

  it('stays hidden for a user without the chat grant', async () => {
    renderLauncher(false);

    await waitFor(() => expect(getAvailabilityMock).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Buka asisten AI' })).not.toBeInTheDocument();
  });

  it('hides itself on the assistant screen', async () => {
    usePathnameMock.mockReturnValue('/admin/ai-assistant');
    renderLauncher();

    await waitFor(() => expect(usePathnameMock).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Buka asisten AI' })).not.toBeInTheDocument();
  });
});
