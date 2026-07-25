// DUMMY-DATA: scripted AI assistant replies with a simulated response delay. No chatbot
// backend exists in the MVP — the real conversation client (chat sessions, streaming
// responses, retrieval references) ships post-MVP in Phase 13 (docs/post-mvp/ai-chatbot.md).
// The UI consumes only the ConversationService interface, so the Phase 13 client is a
// drop-in replacement for this factory.
import type {
  AssistantMessageBody,
  ConversationReplyRequest,
  ConversationService,
} from '#lib/ai-assistant/conversation-types';

const DEFAULT_REPLY_DELAY_MS = 900;

const AI_SUGGESTION_NOTE =
  'Note: This is an AI suggestion. Please verify against hospital protocol and current patient vitals before ordering.';

const SCRIPTED_REPLIES: Record<string, AssistantMessageBody> = {
  'patient-load': {
    paragraphs: [
      "Here is today's patient load at a glance: 14 patients are scheduled, with 3 marked as high-acuity and an average wait time of 24 minutes.",
    ],
    bullets: [
      'High acuity: 3 patients (2 cardiology, 1 internal medicine).',
      'Moderate acuity: 6 patients, longest current wait 41 minutes.',
      'Routine follow-ups: 5 patients, all on schedule.',
    ],
    references: [{ icon: 'article', label: 'Registration Queue snapshot (preview data)' }],
  },
  'cardiology-slot': {
    paragraphs: [
      'Dr. Aris has the following openings for cardiology consultations this week:',
    ],
    bullets: [
      'Thursday 14:30 — 30-minute consultation slot.',
      'Friday 09:00 — 45-minute extended slot.',
      'Friday 15:15 — 30-minute consultation slot.',
    ],
    suggestionNote:
      'Note: This is an AI suggestion. Please confirm availability in the Appointments schedule before booking.',
  },
  'discharge-draft': {
    paragraphs: [
      'Draft discharge summary for Room 402: the latest lab results show electrolytes back within normal range and vitals stable for the past 12 hours.',
    ],
    bullets: [
      'Discharge condition: stable, ambulating independently.',
      'Medications on discharge: continue current regimen, no changes.',
      'Follow-up: outpatient review in 7 days with repeat electrolyte panel.',
    ],
    references: [{ icon: 'article', label: 'Lab Report: Room 402 (preview data)' }],
    suggestionNote: AI_SUGGESTION_NOTE,
  },
};

const FALLBACK_REPLY: AssistantMessageBody = {
  paragraphs: [
    'For mild hypokalemia (3.2 mEq/L), oral potassium supplementation is typically first-line. I would suggest:',
  ],
  bullets: [
    'Potassium Chloride 40 mEq PO once.',
    'Re-check electrolyte panel in 4 hours.',
    'Monitor ECG for any U-wave development or QT prolongation.',
  ],
  suggestionNote: AI_SUGGESTION_NOTE,
};

export type MockConversationServiceOptions = {
  replyDelayMs?: number;
};

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createMockConversationService(
  options: MockConversationServiceOptions = {},
): ConversationService {
  const { replyDelayMs = DEFAULT_REPLY_DELAY_MS } = options;
  return {
    buildGreeting({ displayName }): AssistantMessageBody {
      return {
        paragraphs: [
          `Hello ${displayName}. I've analyzed today's dashboard. You have 14 patients scheduled, with 3 marked as high-acuity.`,
          'Based on the latest lab results for Patient #821 (Maria Garcia), I recommend reviewing the potassium levels before her 10:00 AM consultation. Her current levels are at 3.2 mEq/L, which is slightly below the normal range.',
        ],
        references: [
          { icon: 'article', label: 'Lab Report: 2024-04-14_Garcia.pdf' },
          { icon: 'book', label: 'Journal of Clinical Chemistry (Vol 42)' },
        ],
      };
    },
    async requestReply(request: ConversationReplyRequest): Promise<AssistantMessageBody> {
      await waitFor(replyDelayMs);
      const scriptedReply = request.promptId ? SCRIPTED_REPLIES[request.promptId] : undefined;
      return scriptedReply ?? FALLBACK_REPLY;
    },
  };
}
