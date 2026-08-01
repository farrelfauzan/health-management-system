'use client';

import { useMemo, useState } from 'react';
import { Button, Icon } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { AssistantUnavailableNotice } from '#components/client/ai-assistant/assistant-unavailable-notice';
import { ChatComposer } from '#components/client/ai-assistant/chat-composer';
import { ChatThread } from '#components/client/ai-assistant/chat-thread';
import { ConfidentialDisclaimer } from '#components/client/ai-assistant/confidential-disclaimer';
import { ConsultationPanelDrawer } from '#components/client/ai-assistant/consultation-panel-drawer';
import { ConsultationSidebar } from '#components/client/ai-assistant/consultation-sidebar';
import { PageHeader } from '#components/shared/page-header';
import { usePersistedBoolean } from '#hooks/use-persisted-boolean';
import { useAiAssistant } from '#lib/ai-assistant/ai-assistant-context';
import type { ConsultationHistoryEntry } from '#lib/ai-assistant/consultation-history-entry';
import type { ConsultationPanelProps } from '#lib/ai-assistant/consultation-panel-props';
import { buildSuggestedPrompts, type SuggestedPrompt } from '#lib/ai-assistant/suggested-prompts';
import { useChatAvailability } from '#lib/ai-assistant/use-chat-availability';
import { useChatSessions } from '#lib/ai-assistant/use-chat-sessions';
import type { AppLocale } from '../../../i18n/config';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'hms.ai-assistant.sidebar-collapsed';

/**
 * The assistant screen. It no longer owns the conversation — `AiAssistantProvider`
 * does, above the route — so navigating away and back finds the thread and any
 * in-flight reply still there. What lives here is presentation: layout, the
 * availability gate, and the consultation panel's collapse state.
 */
export function AiAssistantPanel() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('aiAssistant.header');
  const tSidebar = useTranslations('aiAssistant.sidebar');
  const tConversation = useTranslations('aiAssistant.conversation');
  const assistant = useAiAssistant();
  const prompts = useMemo(() => buildSuggestedPrompts(locale), [locale]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistedBoolean(
    SIDEBAR_COLLAPSED_STORAGE_KEY,
    false,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const availabilityQuery = useChatAvailability();
  const availability = availabilityQuery.data;
  const isUnavailable = availability !== undefined && !availability.isAvailable;
  // Sessions are only worth fetching once chat is known to work; asking for
  // them while the feature is off just produces a second failing request.
  const sessionsQuery = useChatSessions(availability?.isAvailable === true);
  const history = useMemo<ConsultationHistoryEntry[]>(
    () =>
      (sessionsQuery.data ?? []).map((session) => ({
        id: session.id,
        title: session.title ?? tSidebar('untitledConsultation'),
      })),
    [sessionsQuery.data, tSidebar],
  );
  const isBusy = assistant.isReplying || assistant.isTranscriptLoading || isUnavailable;
  function handleSelectPrompt(prompt: SuggestedPrompt): void {
    assistant.sendUserMessage({ text: prompt.messageText, promptId: prompt.id });
    setIsDrawerOpen(false);
  }
  function handleNewConsultation(): void {
    assistant.startNewConsultation();
    setIsDrawerOpen(false);
  }
  function handleSelectConsultation(entry: ConsultationHistoryEntry): void {
    assistant.openConsultation(entry);
    setIsDrawerOpen(false);
  }
  function handleConsultationDeleted(sessionId: string): void {
    // Deleting the consultation you are reading has to leave the thread
    // somewhere valid; the alternative is a transcript attached to a session
    // the next send would be rejected against.
    if (assistant.activeSessionId === sessionId) {
      assistant.startNewConsultation();
    }
  }
  const panelProps: ConsultationPanelProps = {
    prompts,
    history,
    activeSessionId: assistant.activeSessionId,
    isBusy,
    isHistoryLoading: sessionsQuery.isPending && availability?.isAvailable === true,
    hasHistoryFailed: sessionsQuery.isError,
    onNewConsultation: handleNewConsultation,
    onSelectPrompt: handleSelectPrompt,
    onSelectConsultation: handleSelectConsultation,
    onConsultationDeleted: handleConsultationDeleted,
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        // "Advanced" is an admin sidebar section; the doctor shell has no such
        // group, so naming one there would describe navigation that isn't there.
        breadcrumbs={
          assistant.assistantPath?.startsWith('/doctor')
            ? [t('breadcrumbs.assistant')]
            : [t('breadcrumbs.advanced'), t('breadcrumbs.assistant')]
        }
      />
      {isUnavailable ? <AssistantUnavailableNotice isEnabled={availability.isEnabled} /> : null}
      <section className="flex h-[calc(100vh-16rem)] min-h-[540px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ConsultationSidebar
          {...panelProps}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={setIsSidebarCollapsed}
        />
        <ConsultationPanelDrawer
          {...panelProps}
          isOpen={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
        />
        <div className="flex min-w-0 flex-1 flex-col bg-surface-bright">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsDrawerOpen(true)}
              aria-label={tSidebar('openPanel')}
            >
              <Icon name="menu" size={20} className="text-current" />
            </Button>
            <span className="text-sm font-medium text-slate-700">{tSidebar('panelTitle')}</span>
          </div>
          {assistant.hasTranscriptFailed ? (
            <p role="status" className="px-6 pt-4 text-sm text-destructive">
              {tConversation('transcriptFailed')}
            </p>
          ) : null}
          {assistant.isTranscriptLoading ? (
            <p role="status" className="px-6 pt-4 text-sm text-slate-500">
              {tConversation('transcriptLoading')}
            </p>
          ) : null}
          <ChatThread
            messages={assistant.messages}
            isReplying={assistant.isReplying}
            onRetry={assistant.retryFailedMessage}
          />
          <div className="px-6 pb-4">
            <ChatComposer isBusy={isBusy} onSend={(text) => assistant.sendUserMessage({ text })} />
            <ConfidentialDisclaimer />
          </div>
        </div>
      </section>
    </div>
  );
}
