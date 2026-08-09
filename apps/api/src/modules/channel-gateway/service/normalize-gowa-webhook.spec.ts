import { GowaWebhookEventInput } from '@hms/shared-types';

import { normalizeGowaWebhook } from './normalize-gowa-webhook';

describe('normalizeGowaWebhook', () => {
  function buildEvent(
    overrides: { event?: string; payload?: Record<string, unknown> } = {},
  ): GowaWebhookEventInput {
    return {
      event: overrides.event ?? 'message',
      device_id: '628111000111@s.whatsapp.net',
      payload: {
        id: '3EB0C127D7BACC83D6A1',
        chat_id: '628123456789@s.whatsapp.net',
        from: '628123456789@s.whatsapp.net',
        from_name: 'Rina',
        timestamp: '2026-08-09T03:12:00Z',
        is_from_me: false,
        body: 'Klinik buka jam berapa?',
        ...overrides.payload,
      },
    } as GowaWebhookEventInput;
  }

  it('reduces a one-to-one text message to the channel-blind shape', () => {
    const actual = normalizeGowaWebhook(buildEvent());

    expect(actual).toEqual({
      channel: 'WHATSAPP',
      externalChatId: '628123456789@s.whatsapp.net',
      externalMessageId: '3EB0C127D7BACC83D6A1',
      senderDisplayName: 'Rina',
      text: 'Klinik buka jam berapa?',
      receivedAt: '2026-08-09T03:12:00.000Z',
      sharedContact: { phoneNumber: '628123456789', isSelfShared: true },
    });
  });

  it('carries the sender JID as proof of possession (§5.1.1 tier 1)', () => {
    const actual = normalizeGowaWebhook(buildEvent());

    // WhatsApp verified this device owns the number before the message could
    // be sent, so the JID *is* the proof — there is nothing to challenge.
    expect(actual?.sharedContact).toEqual({ phoneNumber: '628123456789', isSelfShared: true });
  });

  it('strips the device suffix from a linked-device JID', () => {
    const actual = normalizeGowaWebhook(
      buildEvent({ payload: { from: '628123456789:12@s.whatsapp.net' } }),
    );

    // The same person on their second linked device is the same number.
    expect(actual?.sharedContact?.phoneNumber).toBe('628123456789');
  });

  it('drops the clinic’s own echoed messages', () => {
    // Without this the bot answers itself, and two automated turns is an
    // infinite loop with a banned number at the end of it.
    expect(normalizeGowaWebhook(buildEvent({ payload: { is_from_me: true } }))).toBeNull();
  });

  it('drops a group chat', () => {
    expect(
      normalizeGowaWebhook(buildEvent({ payload: { chat_id: '120363000000000000@g.us' } })),
    ).toBeNull();
  });

  it.each([['receipt'], ['presence'], ['connection']])('drops a %s event', (event) => {
    expect(normalizeGowaWebhook(buildEvent({ event }))).toBeNull();
  });

  it('drops a media message that carries no body', () => {
    expect(normalizeGowaWebhook(buildEvent({ payload: { body: undefined } }))).toBeNull();
    expect(normalizeGowaWebhook(buildEvent({ payload: { body: '   ' } }))).toBeNull();
  });

  it('drops a body longer than any client could have produced', () => {
    expect(
      normalizeGowaWebhook(buildEvent({ payload: { body: 'a'.repeat(4097) } })),
    ).toBeNull();
  });

  it('falls back to the chat id when the sender field is absent', () => {
    const actual = normalizeGowaWebhook(buildEvent({ payload: { from: undefined } }));

    expect(actual?.sharedContact?.phoneNumber).toBe('628123456789');
  });

  it('falls back to now on an unparseable timestamp', () => {
    const actual = normalizeGowaWebhook(buildEvent({ payload: { timestamp: 'not-a-date' } }));

    // An `Invalid Date` here would reach the transcript as an epoch timestamp
    // and reorder the conversation.
    expect(Number.isNaN(Date.parse(actual?.receivedAt ?? ''))).toBe(false);
  });

  it('reports no display name when the bridge offered none', () => {
    const actual = normalizeGowaWebhook(buildEvent({ payload: { from_name: '  ' } }));

    expect(actual?.senderDisplayName).toBeNull();
  });
});
