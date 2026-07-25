// DUMMY-DATA: recent consultation history is static preview content. Chat sessions have no
// MVP backend — the chat.session/chat.message contract ships post-MVP in Phase 13 (see
// docs/post-mvp/ai-chatbot.md). Replace with a chat-session list endpoint when it exists.
export type ConsultationHistoryEntry = {
  id: string;
  title: string;
};

export const MOCK_RECENT_HISTORY: ConsultationHistoryEntry[] = [
  { id: 'history-medication-conflict', title: 'Medication conflict check - Patient #492' },
  { id: 'history-icd-lookup', title: 'ICD-10 Code lookup: Type 2 Diabetes' },
  { id: 'history-shift-handover', title: 'Shift handover notes (April 12)' },
];
