// DUMMY-DATA: suggested analysis prompts are static preview content. The AI chatbot backend
// (chat sessions, contextual prompt suggestions) ships post-MVP in Phase 13 — see
// docs/post-mvp/ai-chatbot.md. Replace with a suggestions endpoint when it exists.
export type SuggestedPrompt = {
  id: string;
  title: string;
  description: string;
  messageText: string;
};

export const MOCK_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'patient-load',
    title: "Summarize today's patient load",
    description: 'Get a breakdown of acuity and wait times.',
    messageText: "Summarize today's patient load.",
  },
  {
    id: 'cardiology-slot',
    title: 'Find next slot: Cardiology',
    description: "Check Dr. Aris's availability.",
    messageText: 'Find the next available cardiology slot.',
  },
  {
    id: 'discharge-draft',
    title: 'Draft discharge for Room 402',
    description: 'Based on recent lab results.',
    messageText: 'Draft a discharge summary for Room 402.',
  },
];
