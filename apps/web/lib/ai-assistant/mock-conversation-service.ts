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
import type { AppLocale } from '../../i18n/config';
import { createAiAssistantTranslator } from '#lib/ai-assistant/localization';

const DEFAULT_REPLY_DELAY_MS = 900;

function buildScriptedReplies(locale: AppLocale): Record<string, AssistantMessageBody> {
  const t = createAiAssistantTranslator(locale);
  const suggestionNote = t('mock.suggestionNote');
  return {
    'patient-load': {
      paragraphs: [t('mock.patientLoadSummary')],
      bullets: [
        t('mock.patientLoadHigh'),
        t('mock.patientLoadModerate'),
        t('mock.patientLoadRoutine'),
      ],
      references: [{ icon: 'article', label: t('mock.queueReference') }],
    },
    'cardiology-slot': {
      paragraphs: [t('mock.cardiologyIntro')],
      bullets: [
        t('mock.cardiologyThursday'),
        t('mock.cardiologyFridayMorning'),
        t('mock.cardiologyFridayAfternoon'),
      ],
      suggestionNote: t('mock.cardiologyNote'),
    },
    'discharge-draft': {
      paragraphs: [t('mock.dischargeSummary')],
      bullets: [
        t('mock.dischargeCondition'),
        t('mock.dischargeMedication'),
        t('mock.dischargeFollowUp'),
      ],
      references: [{ icon: 'article', label: t('mock.roomReference') }],
      suggestionNote,
    },
  };
}

function buildFallbackReply(locale: AppLocale): AssistantMessageBody {
  const t = createAiAssistantTranslator(locale);
  return {
    paragraphs: [t('mock.fallbackIntro')],
    bullets: [t('mock.fallbackDose'), t('mock.fallbackRecheck'), t('mock.fallbackMonitor')],
    suggestionNote: t('mock.suggestionNote'),
  };
}

export type MockConversationServiceOptions = {
  replyDelayMs?: number;
  locale?: AppLocale;
};

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function createMockConversationService(
  options: MockConversationServiceOptions = {},
): ConversationService {
  const { replyDelayMs = DEFAULT_REPLY_DELAY_MS, locale = 'id' } = options;
  const t = createAiAssistantTranslator(locale);
  const scriptedReplies = buildScriptedReplies(locale);
  const fallbackReply = buildFallbackReply(locale);
  return {
    buildGreeting({ displayName }): AssistantMessageBody {
      return {
        paragraphs: [t('mock.greetingSummary', { displayName }), t('mock.greetingLab')],
        references: [
          { icon: 'article', label: t('mock.labReference') },
          { icon: 'book', label: t('mock.journalReference') },
        ],
      };
    },
    async requestReply(request: ConversationReplyRequest): Promise<AssistantMessageBody> {
      await waitFor(replyDelayMs);
      const scriptedReply = request.promptId ? scriptedReplies[request.promptId] : undefined;
      return scriptedReply ?? fallbackReply;
    },
  };
}
