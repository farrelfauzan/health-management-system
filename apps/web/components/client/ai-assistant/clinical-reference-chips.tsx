'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ClinicalReference } from '#lib/ai-assistant/conversation-types';

type ClinicalReferenceChipsProps = {
  references: ClinicalReference[];
};

export function ClinicalReferenceChips({ references }: ClinicalReferenceChipsProps) {
  const t = useTranslations('aiAssistant.conversation');
  return (
    <div className="rounded-lg border border-slate-200 bg-surface-container-low p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-tight text-slate-500">
        {t('clinicalReferences')}
      </p>
      <div className="flex flex-wrap gap-2">
        {references.map((reference) => (
          <span
            key={reference.label}
            className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          >
            <Icon name={reference.icon} size={14} className="text-slate-500" />
            {reference.label}
          </span>
        ))}
      </div>
    </div>
  );
}
