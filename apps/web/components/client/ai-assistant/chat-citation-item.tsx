'use client';

import type { ChatCitationView } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveCitationSourcePresentation } from '#lib/ai-assistant/citation-source-presentation';

type ChatCitationItemProps = {
  citation: ChatCitationView;
};

/**
 * One cited document, with where it came from.
 *
 * The source label sits on the citation, not on the message, because a single
 * answer can draw on clinic policy and on the reader's own upload at once —
 * and those carry very different authority. A clinician reading "menurut
 * panduan" has to be able to tell whether that is something the clinic
 * published or something they themselves uploaded last month.
 *
 * `reference` is the number the assistant was instructed to cite as `[n]`, so
 * a marker in the reply resolves here. It is built from the database row
 * rather than parsed out of the model's prose: an invented `[4]` matches
 * nothing and simply does not appear.
 */
export function ChatCitationItem({ citation }: ChatCitationItemProps) {
  const t = useTranslations('aiAssistant.citations');
  const presentation = resolveCitationSourcePresentation(citation.sourceTier);

  return (
    <li
      className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${presentation.toneClassName}`}
    >
      <span className="mt-0.5 font-semibold tabular-nums">[{citation.reference}]</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{citation.title}</span>
        <span className="mt-0.5 flex items-center gap-1">
          <Icon name={presentation.icon} size={13} className="text-current" aria-hidden="true" />
          {t(`source.${presentation.labelKey}`)}
        </span>
      </span>
    </li>
  );
}
