import { WhatsappWebhookEventInput } from '@hms/shared-types';

import { normalizeWahaWebhook } from './normalize-waha-webhook';

/**
 * What is true of **WAHA's wire format specifically**.
 *
 * The shared normalization contract — which events are dropped, what a kept
 * message becomes — is asserted against this function by
 * `whatsapp-gateway-contract.spec.ts`. What remains here is the handful of
 * places WAHA's shape differs from GOWA's, which are exactly the places a
 * copy-pasted normalizer would fail silently rather than loudly.
 */
describe('normalizeWahaWebhook', () => {
  function buildEvent(
    overrides: { event?: string; payload?: Record<string, unknown> } = {},
  ): WhatsappWebhookEventInput {
    return {
      event: overrides.event ?? 'message',
      session: 'default',
      engine: 'NOWEB',
      payload: {
        id: 'false_628123456789@c.us_AAAA',
        from: '628123456789@c.us',
        to: '628111000111@c.us',
        timestamp: 1786000320,
        fromMe: false,
        body: 'Klinik buka jam berapa?',
        ...overrides.payload,
      },
    } as WhatsappWebhookEventInput;
  }

  it('reads the timestamp as Unix seconds, not milliseconds', () => {
    const actual = normalizeWahaWebhook(buildEvent());

    // Read as milliseconds this lands in 1970 and sorts the transcript
    // backwards — a wrong order that nothing downstream reports as an error.
    expect(actual?.receivedAt).toBe(new Date(1786000320 * 1000).toISOString());
  });

  it.each([[undefined], [0], [Number.NaN]])(
    'falls back to arrival time for timestamp %s',
    (timestamp) => {
      const actual = normalizeWahaWebhook(buildEvent({ payload: { timestamp } }));

      expect(Number.isNaN(Date.parse(actual?.receivedAt ?? ''))).toBe(false);
    },
  );

  it('reads fromMe, not is_from_me', () => {
    // GOWA's key on a WAHA body is always undefined, so reading the wrong one
    // stops filtering the clinic's own replies and the bot answers itself.
    expect(normalizeWahaWebhook(buildEvent({ payload: { fromMe: true } }))).toBeNull();
    expect(normalizeWahaWebhook(buildEvent({ payload: { is_from_me: true } }))).not.toBeNull();
  });

  it('treats `from` as the chat, since WAHA sends no separate chat id', () => {
    const actual = normalizeWahaWebhook(buildEvent());

    expect(actual?.externalChatId).toBe('628123456789@s.whatsapp.net');
  });

  it('reports no display name, because WAHA’s message payload carries none', () => {
    const actual = normalizeWahaWebhook(buildEvent());

    // A documented absence in WAHA's own schema rather than a defect.
    // Inventing one from the JID would put a phone number in the column that
    // exists precisely to avoid showing one.
    expect(actual?.senderDisplayName).toBeNull();
  });
});
