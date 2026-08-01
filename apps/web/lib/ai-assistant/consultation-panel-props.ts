import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';
import type { SuggestedPrompt } from '#lib/ai-assistant/suggested-prompts';

/**
 * Everything the consultation panel needs, shared by its three presentations:
 * the desktop column, the collapsed rail, and the sub-`lg` drawer. One type so
 * the presentations cannot drift into offering different capabilities.
 */
export type ConsultationPanelProps = {
  prompts: SuggestedPrompt[];
  history: ConsultationHistoryEntry[];
  activeSessionId: string | null;
  isBusy: boolean;
  isHistoryLoading: boolean;
  hasHistoryFailed: boolean;
  onNewConsultation: () => void;
  onSelectPrompt: (prompt: SuggestedPrompt) => void;
  onSelectConsultation: (entry: ConsultationHistoryEntry) => void;
};
