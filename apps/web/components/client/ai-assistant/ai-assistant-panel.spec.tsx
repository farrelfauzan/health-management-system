import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppAbilityProvider } from '#components/client/app-ability-provider';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

const createSessionMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const listSessionsMock = vi.hoisted(() => vi.fn());
const listMessagesMock = vi.hoisted(() => vi.fn());
const deleteSessionMock = vi.hoisted(() => vi.fn());
const getAvailabilityMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/ai-chatbot/ai-chatbot', () => ({
  chatControllerCreateSessionV1: createSessionMock,
  chatControllerSendMessageV1: sendMessageMock,
  chatControllerListSessionsV1: listSessionsMock,
  chatControllerListMessagesV1: listMessagesMock,
  chatControllerDeleteSessionV1: deleteSessionMock,
  chatControllerGetAvailabilityV1: getAvailabilityMock,
  getChatControllerListSessionsV1QueryKey: () => ['chat', 'sessions'],
  getChatControllerListMessagesV1QueryKey: (id: string) => ['chat', 'messages', id],
  getChatControllerGetAvailabilityV1QueryKey: () => ['chat', 'availability'],
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ai-assistant',
  useRouter: () => ({ push: pushMock }),
}));

const { AiAssistantProvider } = await import('./ai-assistant-provider');
const { AiAssistantPanel } = await import('./ai-assistant-panel');

function renderPanel(canDelete = true): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AppAbilityProvider rules={canDelete ? [{ action: 'delete', subject: 'ChatSession' }] : []}>
        <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
          <AiAssistantProvider displayName="Dr. Sarah">
            <AiAssistantPanel />
          </AiAssistantProvider>
        </NextIntlClientProvider>
      </AppAbilityProvider>
    </QueryClientProvider>,
  );
}

function buildAxiosError(status: number): Error {
  return Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status, data: {} },
  });
}

describe('AiAssistantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockResolvedValue({
      status: 201,
      data: { data: { id: 'session-1' } },
    });
    listSessionsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    listMessagesMock.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    deleteSessionMock.mockResolvedValue({ status: 200, data: { data: { id: 'session-9' } } });
    getAvailabilityMock.mockResolvedValue({
      status: 200,
      data: { data: { isAvailable: true, isEnabled: true, hasActiveProvider: true } },
    });
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

    expect(await screen.findByText('Klinik buka pukul 08.00-20.00 WIB.')).toBeInTheDocument();
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

  it.each([
    [
      'no provider is active',
      { isAvailable: false, isEnabled: true, hasActiveProvider: false },
      /Belum ada penyedia AI yang aktif/,
    ],
    [
      'the clinic has chat switched off',
      { isAvailable: false, isEnabled: false, hasActiveProvider: false },
      /Obrolan AI dinonaktifkan untuk klinik ini/,
    ],
  ])('explains the specific reason when %s', async (_reason, availability, expectedCopy) => {
    getAvailabilityMock.mockResolvedValue({ status: 200, data: { data: availability } });
    renderPanel();

    // The two reasons send the user to different people, so they must not
    // share one generic message.
    expect(await screen.findByText(expectedCopy)).toBeInTheDocument();
  });

  it('does not ask for sessions while chat is unavailable', async () => {
    getAvailabilityMock.mockResolvedValue({
      status: 200,
      data: { data: { isAvailable: false, isEnabled: true, hasActiveProvider: false } },
    });
    renderPanel();

    await screen.findByText(/Belum ada penyedia AI yang aktif/);
    expect(listSessionsMock).not.toHaveBeenCalled();
  });

  it('keeps the confidential-data disclaimer visible', () => {
    renderPanel();

    expect(screen.getByText('DATA PASIEN RAHASIA:')).toBeInTheDocument();
  });

  describe('when a send fails', () => {
    it('keeps the composer usable and offers a retry instead of hanging', async () => {
      const user = userEvent.setup();
      const unhandled: unknown[] = [];
      const collectUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', collectUnhandled);
      sendMessageMock.mockRejectedValue(new Error('Network Error'));
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

      // The typed question stays in the thread, the failure is visible, and
      // the composer is not disabled for the rest of the page's life.
      expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeEnabled();
      expect(screen.getByText('Ringkas beban pasien hari ini.')).toBeInTheDocument();
      await waitFor(() => expect(unhandled).toHaveLength(0));
      process.off('unhandledRejection', collectUnhandled);
    });

    it('re-sends the same text when the retry is used', async () => {
      const user = userEvent.setup();
      sendMessageMock.mockRejectedValueOnce(new Error('Network Error'));
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));
      await user.click(await screen.findByRole('button', { name: 'Coba lagi' }));

      expect(await screen.findByText('Klinik buka pukul 08.00-20.00 WIB.')).toBeInTheDocument();
      expect(sendMessageMock).toHaveBeenNthCalledWith(2, 'session-1', {
        content: 'Ringkas beban pasien hari ini.',
      });
    });

    it('does not offer a retry when chat is switched off', async () => {
      const user = userEvent.setup();
      sendMessageMock.mockRejectedValue(buildAxiosError(503));
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

      // A 503 is a policy decision the notice explains; inviting the user to
      // hammer a switched-off endpoint would be a lie.
      await waitFor(() => expect(sendMessageMock).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
    });
  });

  describe('recent history', () => {
    function mockOneSession(): void {
      listSessionsMock.mockResolvedValue({
        status: 200,
        data: { data: [{ id: 'session-9', title: 'Jam buka klinik', channel: 'PATIENT' }] },
      });
    }

    it('opens a past consultation and renders its turns', async () => {
      const user = userEvent.setup();
      mockOneSession();
      listMessagesMock.mockResolvedValue({
        status: 200,
        data: {
          data: [
            {
              id: 't1',
              actor: 'USER',
              content: 'Jam berapa klinik buka?',
              createdAt: '2026-07-01T02:00:00.000Z',
            },
            {
              id: 't2',
              actor: 'SYSTEM',
              content: 'redacted-context-payload',
              createdAt: '2026-07-01T02:00:01.000Z',
            },
            {
              id: 't3',
              actor: 'ASSISTANT',
              content: 'Pukul 08.00 sampai 20.00 WIB.',
              createdAt: '2026-07-01T02:00:02.000Z',
            },
          ],
          meta: { nextCursor: null },
        },
      });
      renderPanel();

      await user.click(
        await screen.findByRole('button', { name: 'Buka konsultasi: Jam buka klinik' }),
      );

      expect(await screen.findByText('Pukul 08.00 sampai 20.00 WIB.')).toBeInTheDocument();
      expect(screen.getByText('Jam berapa klinik buka?')).toBeInTheDocument();
      // SYSTEM turns are the record of processing, not conversation.
      expect(screen.queryByText('redacted-context-payload')).not.toBeInTheDocument();
    });

    it('appends to the opened session instead of creating a new one', async () => {
      const user = userEvent.setup();
      mockOneSession();
      renderPanel();

      await user.click(
        await screen.findByRole('button', { name: 'Buka konsultasi: Jam buka klinik' }),
      );
      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

      await waitFor(() =>
        expect(sendMessageMock).toHaveBeenCalledWith('session-9', expect.any(Object)),
      );
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('refreshes the list once a send has created a session', async () => {
      const user = userEvent.setup();
      renderPanel();

      await waitFor(() => expect(listSessionsMock).toHaveBeenCalledTimes(1));
      listSessionsMock.mockResolvedValue({
        status: 200,
        data: { data: [{ id: 'session-1', title: 'Beban pasien', channel: 'DOCTOR' }] },
      });
      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

      // Without the invalidation the conversation the user just had is
      // missing from history until a full page reload.
      expect(await screen.findByText('Beban pasien')).toBeInTheDocument();
    });

    it('says the history is empty rather than rendering nothing', async () => {
      renderPanel();

      expect(await screen.findByText(/Belum ada konsultasi/)).toBeInTheDocument();
    });

    it('distinguishes a failed history load from an empty one', async () => {
      listSessionsMock.mockRejectedValue(new Error('Network Error'));
      renderPanel();

      expect(await screen.findByText('Riwayat konsultasi gagal dimuat.')).toBeInTheDocument();
      expect(screen.queryByText(/Belum ada konsultasi/)).not.toBeInTheDocument();
    });

    it('names a new session after the question that started it', async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

      // Nothing else ever names a session, so without this every entry in
      // the history list reads "untitled".
      await waitFor(() =>
        expect(createSessionMock).toHaveBeenCalledWith({
          channel: 'DOCTOR',
          title: 'Ringkas beban pasien hari ini.',
        }),
      );
    });

    it('removes a consultation after the confirmation is accepted', async () => {
      const user = userEvent.setup();
      mockOneSession();
      renderPanel();

      await user.click(
        await screen.findByRole('button', { name: 'Hapus konsultasi: Jam buka klinik' }),
      );
      listSessionsMock.mockResolvedValue({ status: 200, data: { data: [] } });
      await user.click(screen.getByRole('button', { name: 'Hapus' }));

      await waitFor(() => expect(deleteSessionMock).toHaveBeenCalledWith('session-9'));
      expect(await screen.findByText(/Belum ada konsultasi/)).toBeInTheDocument();
    });

    it('does not delete anything until the confirmation is accepted', async () => {
      const user = userEvent.setup();
      mockOneSession();
      renderPanel();

      await user.click(
        await screen.findByRole('button', { name: 'Hapus konsultasi: Jam buka klinik' }),
      );
      await user.click(screen.getByRole('button', { name: 'Batal' }));

      expect(deleteSessionMock).not.toHaveBeenCalled();
      expect(screen.getByText('Jam buka klinik')).toBeInTheDocument();
    });

    it('hides the delete control from a user without the grant', async () => {
      mockOneSession();
      renderPanel(false);

      // Visibility only — the backend guard is still the source of truth.
      expect(await screen.findByText('Jam buka klinik')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Hapus konsultasi: Jam buka klinik' }),
      ).not.toBeInTheDocument();
    });

    it('returns to a fresh consultation when the open one is deleted', async () => {
      const user = userEvent.setup();
      mockOneSession();
      listMessagesMock.mockResolvedValue({
        status: 200,
        data: {
          data: [
            {
              id: 't1',
              actor: 'USER',
              content: 'Jam berapa klinik buka?',
              createdAt: '2026-07-01T02:00:00.000Z',
            },
          ],
          meta: { nextCursor: null },
        },
      });
      renderPanel();

      await user.click(
        await screen.findByRole('button', { name: 'Buka konsultasi: Jam buka klinik' }),
      );
      await screen.findByText('Jam berapa klinik buka?');
      await user.click(screen.getByRole('button', { name: 'Hapus konsultasi: Jam buka klinik' }));
      listSessionsMock.mockResolvedValue({ status: 200, data: { data: [] } });
      await user.click(screen.getByRole('button', { name: 'Hapus' }));

      // Leaving the transcript on screen would attach the next send to a
      // session the server has already retired.
      await waitFor(() =>
        expect(screen.queryByText('Jam berapa klinik buka?')).not.toBeInTheDocument(),
      );
      expect(screen.getByText(/Halo Dr\. Sarah\./)).toBeInTheDocument();
    });
  });
});
