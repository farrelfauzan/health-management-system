import { TelegramWebhookUpdateInput } from '@hms/shared-types';

import { normalizeTelegramUpdate } from './normalize-telegram-update';

describe('normalizeTelegramUpdate', () => {
  function buildUpdate(
    overrides: Partial<NonNullable<TelegramWebhookUpdateInput['message']>> = {},
  ): TelegramWebhookUpdateInput {
    return {
      update_id: 900_001,
      message: {
        message_id: 42,
        // 2026-08-06T09:00:00.000Z
        date: 1_786_006_800,
        chat: { id: 12_345, type: 'private' },
        from: { id: 12_345, is_bot: false, first_name: 'Siti', last_name: 'Rahayu' },
        text: 'Klinik buka jam berapa?',
        ...overrides,
      },
    };
  }

  it('reduces a private text message to the channel-blind shape', () => {
    const actualMessage = normalizeTelegramUpdate(buildUpdate());

    expect(actualMessage).toEqual({
      channel: 'TELEGRAM',
      externalChatId: '12345',
      externalMessageId: '42',
      senderDisplayName: 'Siti Rahayu',
      text: 'Klinik buka jam berapa?',
      receivedAt: '2026-08-06T09:00:00.000Z',
    });
  });

  it('uses Telegram’s own timestamp rather than arrival time', () => {
    const actualMessage = normalizeTelegramUpdate(buildUpdate({ date: 1_786_003_200 }));

    // A gateway that buffered during an outage delivers old messages, and
    // stamping them with arrival time would reorder the conversation.
    expect(actualMessage?.receivedAt).toBe('2026-08-06T08:00:00.000Z');
  });

  it('ignores a group chat rather than answering several people as one customer', () => {
    expect(
      normalizeTelegramUpdate(buildUpdate({ chat: { id: -100, type: 'group' } })),
    ).toBeNull();
  });

  it('ignores another bot, which would otherwise loop', () => {
    expect(
      normalizeTelegramUpdate(
        buildUpdate({ from: { id: 999, is_bot: true, first_name: 'EchoBot' } }),
      ),
    ).toBeNull();
  });

  it('ignores a non-text message instead of failing the webhook', () => {
    // Stickers and photos arrive on the same webhook. Refusing one would have
    // Telegram redeliver that sticker on a schedule.
    expect(normalizeTelegramUpdate(buildUpdate({ text: undefined }))).toBeNull();
  });

  it('ignores a whitespace-only message', () => {
    expect(normalizeTelegramUpdate(buildUpdate({ text: '   \n  ' }))).toBeNull();
  });

  it('ignores text longer than Telegram itself can send', () => {
    expect(normalizeTelegramUpdate(buildUpdate({ text: 'a'.repeat(4097) }))).toBeNull();
  });

  it('ignores an update carrying no message at all', () => {
    expect(normalizeTelegramUpdate({ update_id: 900_002 })).toBeNull();
  });

  it('trims the message body', () => {
    const actualMessage = normalizeTelegramUpdate(buildUpdate({ text: '  halo dok  ' }));

    expect(actualMessage?.text).toBe('halo dok');
  });

  it('falls back to the username when no name is set', () => {
    const actualMessage = normalizeTelegramUpdate(
      buildUpdate({ from: { id: 12_345, is_bot: false, username: 'siti_r' } }),
    );

    expect(actualMessage?.senderDisplayName).toBe('siti_r');
  });

  it('reports no display name rather than an empty string', () => {
    const actualMessage = normalizeTelegramUpdate(
      buildUpdate({ from: { id: 12_345, is_bot: false } }),
    );

    expect(actualMessage?.senderDisplayName).toBeNull();
  });

  it('keeps the chat id and message id as separate fields', () => {
    const actualMessage = normalizeTelegramUpdate(buildUpdate({ message_id: 1 }));

    // Telegram numbers messages per chat, so `1` recurs across customers. The
    // dedup constraint carries both, and collapsing them into one key here
    // would drop the second customer's first message as a duplicate.
    expect(actualMessage?.externalMessageId).toBe('1');
    expect(actualMessage?.externalChatId).toBe('12345');
  });
});
