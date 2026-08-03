/**
 * Canonical examples for the chat endpoints, mirrored by `ApiEndpoint` into
 * the OpenAPI document. The disclaimer appears in `meta`, never inside an
 * assistant message's content — the examples show the contract the frontend
 * must honour. All values are synthetic.
 */
export const AI_CHAT_EXAMPLES = {
  availability: {
    isAvailable: true,
    isEnabled: true,
    hasActiveProvider: true,
  },
  session: {
    id: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    channel: 'PATIENT',
    title: 'Jam buka klinik',
    providerKind: 'DEEPSEEK',
    createdAt: '2026-08-14T01:00:00.000Z',
    updatedAt: '2026-08-14T01:00:00.000Z',
  },
  adminSession: {
    id: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    channel: 'PATIENT',
    title: 'Jam buka klinik',
    providerKind: 'DEEPSEEK',
    ownerUserId: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    createdAt: '2026-08-14T01:00:00.000Z',
    updatedAt: '2026-08-14T01:00:00.000Z',
  },
  createSessionRequest: {
    channel: 'PATIENT',
    title: 'Jam buka klinik',
  },
  sendMessageRequest: {
    content: 'Kapan klinik buka pada hari Sabtu?',
  },
  userMessage: {
    id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
    actor: 'USER',
    content: 'Kapan klinik buka pada hari Sabtu?',
    disclaimerShown: false,
    safetyTags: [],
    providerRequestId: null,
    providerModel: null,
    createdAt: '2026-08-14T01:05:00.000Z',
  },
  assistantMessage: {
    id: '4b5c6d7e-8f9a-4b0c-9d1e-2f3a4b5c6d7e',
    actor: 'ASSISTANT',
    content: 'Klinik buka pukul 08.00-14.00 WIB pada hari Sabtu.',
    disclaimerShown: true,
    safetyTags: [],
    providerRequestId: 'req_abc123',
    providerModel: 'deepseek-chat',
    createdAt: '2026-08-14T01:05:01.000Z',
  },
  exchangeMeta: {
    disclaimer:
      'Informasi ini bukan diagnosis medis. Konsultasikan dengan tenaga kesehatan. / This information is not a medical diagnosis. Please consult a healthcare professional.',
    providerKind: 'DEEPSEEK',
    model: 'deepseek-chat',
    providerRequestId: 'req_abc123',
  },
  sessionListMeta: {
    nextCursor: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  },
  preferences: {
    preferredLanguage: 'ID',
    responseLength: 'SHORT',
    defaultSpecialtyId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    defaultSpecialtyName: 'Poli Umum',
    updatedAt: '2026-08-03T02:00:00.000Z',
  },
  emptyPreferences: {
    preferredLanguage: null,
    responseLength: null,
    defaultSpecialtyId: null,
    defaultSpecialtyName: null,
    updatedAt: null,
  },
  updatePreferencesRequest: {
    preferredLanguage: 'ID',
    responseLength: 'SHORT',
  },
  deletedSession: {
    id: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  },
} as const;
