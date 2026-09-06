'use client';

import type { DocumentTemplateDiffSegment } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type TemplateDiffSegmentProps = {
  segment: DocumentTemplateDiffSegment;
};

const SEGMENT_STYLES: Readonly<Record<DocumentTemplateDiffSegment['kind'], string>> = {
  UNCHANGED: 'border-transparent bg-white text-slate-500',
  ADDED: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  REMOVED: 'border-rose-200 bg-rose-50 text-rose-900 line-through decoration-rose-400',
};

/**
 * One block of a template diff (`P16-T32`, FR-E5-22).
 *
 * The markup is shown as text rather than rendered. An approver is comparing
 * *layouts*, and a diff that rendered each side would hide exactly the
 * changes — a swapped column, a removed materai area — that the rendered
 * preview above it already shows properly.
 *
 * Colour is never the only signal: added and removed carry a word as well,
 * because a reviewer who cannot tell green from red still has to be able to
 * tell an addition from a deletion.
 */
export function TemplateDiffSegment({ segment }: TemplateDiffSegmentProps) {
  const t = useTranslations('operations.billing.templates.approval.review');

  return (
    <li
      className={`flex gap-3 border-l-2 px-3 py-1.5 font-mono text-xs ${SEGMENT_STYLES[segment.kind]}`}
    >
      {segment.kind === 'UNCHANGED' ? null : (
        <span className="shrink-0 font-sans text-[11px] font-semibold uppercase tracking-wide">
          {segment.kind === 'ADDED' ? t('added') : t('removed')}
        </span>
      )}
      <span className="min-w-0 break-all">{segment.text}</span>
    </li>
  );
}
