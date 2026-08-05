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
    sessionTitle: 'Jam buka klinik hari Sabtu',
    // Present only on a grounded exchange, and the reason it is in the example
    // at all: the field ships on real responses, so a contract that omits it
    // understates the endpoint and leaves generated clients unable to read it
    // without hand-declaring the shape.
    //
    // Two entries rather than one because `sourceTier` is the load-bearing
    // field — an answer can draw on the clinic corpus and on the asking user's
    // own documents in the same breath, and those carry different authority.
    citations: [
      {
        reference: 1,
        documentId: '2f6d1a4c-8b9e-4c1d-9a2f-5e7b3c0d8a11',
        title: 'SOP Jam Operasional Klinik',
        language: 'ID',
        sourceTier: 'CLINIC',
      },
      {
        reference: 2,
        documentId: '7b3f2c19-5d84-4a6e-9c02-1f8ad7c35e60',
        title: 'Panduan Tatalaksana Hipertensi 2026',
        language: 'ID',
        sourceTier: 'PERSONAL',
      },
    ],
  },
  sessionListMeta: {
    nextCursor: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  },
  deletedSession: {
    id: '7d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  },
} as const;
