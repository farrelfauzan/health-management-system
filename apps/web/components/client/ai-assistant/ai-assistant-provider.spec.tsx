import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@hms/ui';

import { useAiAssistant } from '#lib/ai-assistant/ai-assistant-context';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

const createSessionMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const listMessagesMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/ai-chatbot/ai-chatbot', () => ({
  chatControllerCreateSessionV1: createSessionMock,
  chatControllerSendMessageV1: sendMessageMock,
  chatControllerListMessagesV1: listMessagesMock,
  getChatControllerListSessionsV1QueryKey: () => ['chat', 'sessions'],
  getChatControllerListMessagesV1QueryKey: (id: string) => ['chat', 'messages', id],
  getChatControllerGetAvailabilityV1QueryKey: () => ['chat', 'availability'],
}));
vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

const { AiAssistantProvider } = await import('./ai-assistant-provider');

/**
 * Stands in for whatever is on screen while a reply is in flight — the point
 * being that it is *not* the assistant panel.
 */
function ConversationProbe() {
  const assistant = useAiAssistant();
  return (
    <div>
      <button type="button" onClick={() => assistant.sendUserMessage({ text: 'Halo' })}>
        kirim
      </button>
      <span data-testid="unread">{assistant.unreadCount}</span>
    </div>
  );
}

function renderProvider(): { rerender: () => void } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A fresh element each time: React bails out of re-rendering a subtree whose
  // element is referentially identical, which would hide the pathname change
  // this harness exists to simulate.
  const buildTree = () => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
        <AiAssistantProvider displayName="Dr. Sarah" assistantPath="/admin/ai-assistant">
          <ConversationProbe />
        </AiAssistantProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(buildTree());
  return { rerender: () => view.rerender(buildTree()) };
}

describe('AiAssistantProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/admin/patients');
    createSessionMock.mockResolvedValue({ status: 201, data: { data: { id: 'session-1' } } });
    listMessagesMock.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    sendMessageMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          userMessage: { id: 'm1', actor: 'USER', content: 'Halo' },
          assistantMessage: { id: 'm2', actor: 'ASSISTANT', content: 'Selamat siang.' },
        },
        meta: { disclaimer: 'Informasi ini bukan diagnosis medis.' },
      },
    });
  });

  it('lands a reply that arrives while the user is on another screen', async () => {
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'kirim' }));

    // The conversation lives above the route, so the reply has somewhere to
    // go even though the assistant screen is not mounted.
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));
  });

  it('raises one toast per reply that arrives while away', async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, 'info').mockReturnValue('toast-id');
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'kirim' }));

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy).toHaveBeenCalledWith('Asisten AI telah membalas.', expect.any(Object));
    toastSpy.mockRestore();
  });

  it('stays silent when the user is already looking at the assistant', async () => {
    const user = userEvent.setup();
    const toastSpy = vi.spyOn(toast, 'info').mockReturnValue('toast-id');
    usePathnameMock.mockReturnValue('/admin/ai-assistant');
    renderProvider();

    await user.click(screen.getByRole('button', { name: 'kirim' }));

    // A toast for a reply the user is watching arrive is noise.
    await waitFor(() => expect(sendMessageMock).toHaveBeenCalled());
    expect(toastSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
    toastSpy.mockRestore();
  });

  it('clears the unread count once the assistant screen is opened', async () => {
    const user = userEvent.setup();
    const { rerender } = renderProvider();

    await user.click(screen.getByRole('button', { name: 'kirim' }));
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('1'));
    usePathnameMock.mockReturnValue('/admin/ai-assistant');
    rerender();

    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('0'));
  });
});
