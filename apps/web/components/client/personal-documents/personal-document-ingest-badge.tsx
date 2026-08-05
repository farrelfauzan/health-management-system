'use client';

import type { DocumentIngestStatusValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { resolvePersonalDocumentIngestState } from '#lib/personal-documents/personal-document-ingest-state';

type PersonalDocumentIngestBadgeProps = {
  status: DocumentIngestStatusValue;
  ingestError: string | null;
};

const TONE_CLASS_NAME: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  positive: 'bg-emerald-100 text-emerald-900',
  negative: 'bg-red-100 text-red-900',
  neutral: 'bg-slate-100 text-slate-700',
};

/**
 * The document's ingest state, and — when it is not `READY` — the fact that
 * the assistant cannot answer from it yet.
 *
 * The "not answerable yet" line is the honest part. Upload succeeding and the
 * document being retrievable are different events separated by a background
 * worker, and an owner who uploaded a guideline this morning has every reason
 * to assume the assistant is using it. Saying so explicitly costs one line and
 * prevents a clinician relying on guidance the model has never seen.
 *
 * A failure shows `ingestError` verbatim rather than a generic message: the
 * API never puts file content in that field, and it is the only thing that
 * tells the owner whether to re-ingest or re-upload a different file.
 */
export function PersonalDocumentIngestBadge({
  status,
  ingestError,
}: PersonalDocumentIngestBadgeProps) {
  const t = useTranslations('personalKnowledgeBase.ingest');
  const state = resolvePersonalDocumentIngestState(status);

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS_NAME[state.tone] ?? TONE_CLASS_NAME.neutral}`}
      >
        {t(`status.${state.labelKey}`)}
      </span>
      {state.isAnswerable ? null : (
        <p className="text-xs text-slate-500">{t('notAnswerableYet')}</p>
      )}
      {status === 'FAILED' && ingestError ? (
        <p className="text-xs text-red-700">{ingestError}</p>
      ) : null}
    </div>
  );
}
