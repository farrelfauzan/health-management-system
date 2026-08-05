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

  const mockRetrievalTurnContent = JSON.stringify({
    promptBlock: '[1] Klinik buka pukul 08.00-16.00…',
    citations: [
      {
        reference: 1,
        documentId: 'doc-clinic',
        title: 'SOP Jam Operasional',
        language: 'ID',
        sourceTier: 'CLINIC',
      },
      {
        reference: 2,
        documentId: 'doc-personal',
        title: 'Panduan Hipertensi',
        language: 'ID',
        sourceTier: 'PERSONAL',
      },
    ],
  });

  it('attaches replayed citations forward, to the answer they grounded', () => {
    // The retrieval turn is written *before* the provider call, so it precedes
    // its own assistant turn — the opposite of a tool turn, which trails the
    // reply it explains. Attaching backward here would hang this exchange's
    // sources on the previous answer.
    const messages = project([
      buildTurn({ id: '1', actor: 'USER', content: 'Jam buka klinik?' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: mockRetrievalTurnContent }),
      buildTurn({ id: '3', actor: 'ASSISTANT', content: 'Klinik buka 08.00-16.00 [1].' }),
    ]);

    const assistant = messages[1] as AssistantConversationMessage;
    expect(assistant.role).toBe('assistant');
    expect(assistant.body.citations).toHaveLength(2);
    expect(assistant.body.citations?.map((citation) => citation.sourceTier)).toEqual([
      'CLINIC',
      'PERSONAL',
    ]);
  });

  it('keeps citations on their own exchange across two grounded turns', () => {
    const secondRetrieval = JSON.stringify({
      promptBlock: '[1] Tarif poli…',
      citations: [
        {
          reference: 1,
          documentId: 'doc-tarif',
          title: 'Tarif Poli Umum',
          language: 'ID',
          sourceTier: 'CLINIC',
        },
      ],
    });
    const messages = project([
      buildTurn({ id: '1', actor: 'USER', content: 'Jam buka?' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: mockRetrievalTurnContent }),
      buildTurn({ id: '3', actor: 'ASSISTANT', content: 'Buka 08.00 [1].' }),
      buildTurn({ id: '4', actor: 'USER', content: 'Tarifnya?' }),
      buildTurn({ id: '5', actor: 'SYSTEM', content: secondRetrieval }),
      buildTurn({ id: '6', actor: 'ASSISTANT', content: 'Rp50.000 [1].' }),
    ]);

    const first = messages[1] as AssistantConversationMessage;
    const second = messages[3] as AssistantConversationMessage;
    expect(first.body.citations).toHaveLength(2);
    expect(second.body.citations).toHaveLength(1);
    expect(second.body.citations?.[0]?.documentId).toBe('doc-tarif');
  });

  it('leaves an ungrounded answer without citations', () => {
    const messages = project([
      buildTurn({ id: '1', actor: 'USER', content: 'Halo' }),
      buildTurn({ id: '2', actor: 'ASSISTANT', content: 'Halo, ada yang bisa dibantu?' }),
    ]);

    expect((messages[1] as AssistantConversationMessage).body.citations).toBeUndefined();
  });

  it('carries citations and a tool result on the same answer', () => {
    // One exchange can do both, and they arrive on opposite sides of the
    // assistant turn.
    const messages = project([
      buildTurn({ id: '1', actor: 'USER', content: 'Stok amoxicillin?' }),
      buildTurn({ id: '2', actor: 'SYSTEM', content: mockRetrievalTurnContent }),
      buildTurn({ id: '3', actor: 'ASSISTANT', content: 'Saya cek stok.' }),
      buildTurn({ id: '4', actor: 'SYSTEM', content: mockToolTurnContent }),
    ]);

    const assistant = messages[1] as AssistantConversationMessage;
    expect(assistant.body.citations).toHaveLength(2);
    expect(assistant.body.toolResults).toHaveLength(1);
  });

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
