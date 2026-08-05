'use client';

import type { DocumentIngestStatusValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { resolveDocumentIngestState } from '#lib/documents/document-ingest-state';

type ClinicDocumentIngestBadgeProps = {
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
 * A clinic document's ingest state, and — when it is not `READY` — the fact
 * that nothing can be answered from it yet.
 *
 * The stakes are higher here than on a personal knowledge base. An admin who
 * uploads the clinic's opening hours has every reason to assume the assistant
 * and the WhatsApp channel started using them; until the worker finishes there
 * are no chunks and no vectors, and the bot will keep answering from whatever
 * it had before. Saying so on the row costs one line and prevents a corpus
 * that looks published and is not.
 *
 * A failure shows `ingestError` verbatim rather than a generic message: the
 * API never puts file content in that field — it is an authored category
 * string — and it is the only thing that tells an admin whether to re-ingest
 * or to upload a different file.
 */
export function ClinicDocumentIngestBadge({
  status,
  ingestError,
}: ClinicDocumentIngestBadgeProps) {
  const t = useTranslations('clinicCorpus.ingest');
  const state = resolveDocumentIngestState(status);

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
