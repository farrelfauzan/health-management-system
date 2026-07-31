import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

const createSessionMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const listSessionsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/ai-chatbot/ai-chatbot', () => ({
  chatControllerCreateSessionV1: createSessionMock,
  chatControllerSendMessageV1: sendMessageMock,
  chatControllerListSessionsV1: listSessionsMock,
  getChatControllerListSessionsV1QueryKey: () => ['chat', 'sessions'],
}));

const { AiAssistantPanel } = await import('./ai-assistant-panel');

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
        <AiAssistantPanel displayName="Dr. Sarah" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('AiAssistantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({
      status: 201,
      data: { data: { id: 'session-1' } },
    });
    listSessionsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    sendMessageMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          userMessage: { id: 'm1', actor: 'USER', content: 'Halo' },
          assistantMessage: {
            id: 'm2',
            actor: 'ASSISTANT',
            content: 'Klinik buka pukul 08.00-20.00 WIB.',
          },
        },
        meta: { disclaimer: 'Informasi ini bukan diagnosis medis.' },
      },
    });
  });

  it('opens with the greeting addressed to the signed-in user', () => {
    renderPanel();

    expect(screen.getByText(/Halo Dr\. Sarah\./)).toBeInTheDocument();
  });

  it('does not create a session until the first message is sent', () => {
    renderPanel();

    // Opening the screen and typing nothing must not consume a session row
    // or count against the daily quota.
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('creates a session and renders the assistant reply', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

    expect(
      await screen.findByText('Klinik buka pukul 08.00-20.00 WIB.'),
    ).toBeInTheDocument();
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith('session-1', expect.any(Object));
  });

  it('renders the disclaimer the server returned in meta', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

    // The disclaimer must come from the response envelope, never from a
    // string the UI holds locally.
    expect(await screen.findByText('Informasi ini bukan diagnosis medis.')).toBeInTheDocument();
  });

  it('reuses one session across turns in the same consultation', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));
    await screen.findByText('Klinik buka pukul 08.00-20.00 WIB.');
    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('lists the user’s existing sessions in the sidebar', async () => {
    listSessionsMock.mockResolvedValue({
      status: 200,
      data: { data: [{ id: 'session-9', title: 'Jam buka klinik', channel: 'PATIENT' }] },
    });
    renderPanel();

    expect(await screen.findByText('Jam buka klinik')).toBeInTheDocument();
  });

  it('keeps the confidential-data disclaimer visible', () => {
    renderPanel();

    expect(screen.getByText('DATA PASIEN RAHASIA:')).toBeInTheDocument();
  });
});
