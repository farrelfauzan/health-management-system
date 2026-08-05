'use client';

import type { ChatCitationView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { ChatCitationItem } from '#components/client/ai-assistant/chat-citation-item';

type ChatCitationListProps = {
  citations: ChatCitationView[];
};

/**
 * The documents a reply was grounded in.
 *
 * Rendered as a list of individually-labelled citations rather than a single
 * "sources" line: a mixed answer is the normal case once a user keeps their
 * own corpus, and one heading covering both tiers would tell the reader
 * nothing about which sentence came from where.
 */
export function ChatCitationList({ citations }: ChatCitationListProps) {
  const t = useTranslations('aiAssistant.citations');

  return (
    <div className="rounded-lg border border-slate-200 bg-surface-container-low p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-tight text-slate-500">
        {t('heading')}
      </p>
      <ul className="space-y-1.5">
        {citations.map((citation) => (
          <ChatCitationItem key={citation.documentId} citation={citation} />
        ))}
      </ul>
    </div>
  );
}
