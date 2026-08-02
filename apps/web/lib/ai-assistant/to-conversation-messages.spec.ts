import type { ChatMessageView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import type { AssistantConversationMessage } from '#lib/ai-assistant/conversation-types';
import { toConversationMessages } from '#lib/ai-assistant/to-conversation-messages';

describe('toConversationMessages', () => {
  const mockToolTurnContent = JSON.stringify({
    toolName: 'check_medication_stock',
    arguments: { medicationName: 'amoxicillin' },
    outcome: 'SUCCESS',
    result: { medicationName: 'amoxicillin', matchCount: 0, items: [] },
    errorCode: null,
  });

  function buildTurn(overrides: Partial<ChatMessageView> & { id: string }): ChatMessageView {
    return {
      actor: 'USER',
      content: '',
      disclaimerShown: false,
      safetyTags: [],
      providerRequestId: null,
      providerModel: null,
      createdAt: '2026-08-02T12:00:00.000Z',
      ...overrides,
    } as ChatMessageView;
  }

  function project(turns: ChatMessageView[]) {
    return toConversationMessages({
      turns,
      displayName: 'Yusuf Hidayat',
      assistantName: 'Asisten Klinis AI',
      formatSentAt: () => 'Baru saja',
    });
  }

  it('restores a tool lookup onto the assistant turn that announced it', () => {
    // Without this a reopened consultation shows "Saya cek stok" with nothing
    // beneath it, which reads as a broken assistant rather than a rendered one.
    const actual = project([
      buildTurn({ id: '1', actor: 'USER', content: 'amoxicillin ada ga?' }),
      buildTurn({ id: '2', actor: 'ASSISTANT', content: 'Saya cek stoknya.' }),
      buildTurn({ id: '3', actor: 'SYSTEM', content: mockToolTurnContent }),
    ]);

    expect(actual).toHaveLength(2);
    const assistantMessage = actual[1] as AssistantConversationMessage;
    expect(assistantMessage.body.toolResults).toEqual([
      {
        kind: 'STOCK',
        result: { medicationName: 'amoxicillin', matchCount: 0, items: [] },
      },
    ]);
  });

  it('never renders a SYSTEM turn as conversation', () => {
    const actual = project([
      buildTurn({ id: '1', actor: 'ASSISTANT', content: 'Saya cek stoknya.' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: mockToolTurnContent }),
    ]);

    expect(actual.map((message) => message.role)).toEqual(['assistant']);
  });

  it('ignores a context-enrichment SYSTEM turn', () => {
    // The same actor carries two payloads; only one is a lookup. A context
    // snapshot is the record of processing, not an answer to render.
    const actual = project([
      buildTurn({ id: '1', actor: 'ASSISTANT', content: 'Halo.' }),
      buildTurn({
        id: '2',
        actor: 'SYSTEM',
        content: JSON.stringify({ todayAppointmentCount: 4, assignedPatientCount: 12 }),
      }),
    ]);

    expect((actual[0] as AssistantConversationMessage).body.toolResults).toBeUndefined();
  });

  it('attaches each lookup to its own exchange rather than the newest one', () => {
    const actual = project([
      buildTurn({ id: '1', actor: 'ASSISTANT', content: 'Saya cek stoknya.' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: mockToolTurnContent }),
      buildTurn({ id: '3', actor: 'USER', content: 'mana?' }),
      buildTurn({ id: '4', actor: 'ASSISTANT', content: 'Saya cek lagi.' }),
      buildTurn({ id: '5', actor: 'SYSTEM', content: mockToolTurnContent }),
    ]);

    // SYSTEM turns are dropped, so the two assistant turns sit at 0 and 2.
    expect(actual.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant']);
    expect((actual[0] as AssistantConversationMessage).body.toolResults).toHaveLength(1);
    expect((actual[2] as AssistantConversationMessage).body.toolResults).toHaveLength(1);
  });

  it('drops a tool turn that has no assistant turn to attach to', () => {
    const actual = project([buildTurn({ id: '1', actor: 'SYSTEM', content: mockToolTurnContent })]);

    expect(actual).toEqual([]);
  });

  it('ignores a SYSTEM turn that is not JSON at all', () => {
    const actual = project([
      buildTurn({ id: '1', actor: 'ASSISTANT', content: 'Halo.' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: 'not json' }),
    ]);

    expect((actual[0] as AssistantConversationMessage).body.toolResults).toBeUndefined();
  });
});
