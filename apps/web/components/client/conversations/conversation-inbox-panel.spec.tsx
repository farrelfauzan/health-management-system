import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

const listConversationsMock = vi.hoisted(() => vi.fn());
const handoffSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/customer-service/customer-service', () => ({
  csAdminControllerListConversationsV1: listConversationsMock,
  csAdminControllerGetHandoffSummaryV1: handoffSummaryMock,
  csAdminControllerGetTranscriptV1: vi.fn(),
  csAdminControllerTakeOverV1: vi.fn(),
  csAdminControllerReleaseV1: vi.fn(),
  csAdminControllerReplyV1: vi.fn(),
  csAdminControllerBlockV1: vi.fn(),
  csAdminControllerUnblockV1: vi.fn(),
  getCsAdminControllerListConversationsV1QueryKey: (params: unknown) => [
    'conversations',
    params,
  ],
  getCsAdminControllerGetHandoffSummaryV1QueryKey: () => ['conversation-handoff'],
  getCsAdminControllerGetTranscriptV1QueryKey: () => ['conversation-transcript'],
}));

const { ConversationInboxPanel } = await import('./conversation-inbox-panel');

function buildConversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conversation-1',
    channel: 'TELEGRAM',
    externalChatId: '184920371',
    senderDisplayName: 'Rina',
    state: 'NEEDS_HUMAN',
    isBlocked: false,
    blockedAt: null,
    waitingForSeconds: 420,
    messageCount: 14,
    lastMessageAt: '2026-08-09T02:41:00.000Z',
    createdAt: '2026-08-09T02:18:00.000Z',
    ...overrides,
  };
}

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
        <ConversationInboxPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ConversationInboxPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoffSummaryMock.mockResolvedValue({
      status: 200,
      data: {
        data: { needsHumanCount: 2, humanActiveCount: 1, oldestWaitingSince: null },
      },
    });
  });

  it('opens on the handoff queue rather than on every conversation', async () => {
    listConversationsMock.mockResolvedValue({ status: 200, data: { data: [] } });

    renderPanel();
    await screen.findByText('Tidak ada percakapan pada filter ini.');

    // The reason an admin opens this screen is that somebody is waiting. A
    // default of ALL would make them filter before seeing the queue, and a
    // queue behind a filter is a queue that gets checked less often.
    expect(listConversationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'HANDOFF' }),
      expect.anything(),
    );
  });

  it('shows the customer and the wait without any message text', async () => {
    listConversationsMock.mockResolvedValue({
      status: 200,
      data: { data: [buildConversation()] },
    });

    renderPanel();

    expect(await screen.findByText('Rina')).toBeInTheDocument();
    expect(screen.getByText('184920371')).toBeInTheDocument();
    expect(screen.getByText('7 mnt')).toBeInTheDocument();
  });

  it('badges a blocked chat as blocked rather than by its underlying state', async () => {
    listConversationsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildConversation({ state: 'BOT_ACTIVE', isBlocked: true })],
      },
    });

    renderPanel();

    expect(await screen.findByText('Diblokir')).toBeInTheDocument();
    expect(screen.queryByText('Bot')).not.toBeInTheDocument();
  });

  it('does not report a wait for a conversation somebody is already handling', async () => {
    listConversationsMock.mockResolvedValue({
      status: 200,
      data: {
        data: [buildConversation({ state: 'HUMAN_ACTIVE', waitingForSeconds: null })],
      },
    });

    renderPanel();

    expect(await screen.findByText('Dengan petugas')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
