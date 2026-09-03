'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

/**
 * The notice that makes the vault legible (US-E3-03), and the exact inverse
 * of `NoPatientDataNotice` on the knowledge base.
 *
 * That one warns you what must *not* go in, because everything in that corpus
 * is chunked and its passages are sent to an AI provider. This one says
 * plainly that nothing here is: these files are stored and served to you, the
 * assistant never reads them, and no administrator can open them.
 *
 * It is worth saying out loud rather than leaving to be inferred. The two
 * surfaces sit side by side in the same navigation, hold the same file types,
 * and share a database table — a person who cannot tell them apart will
 * either keep their KTP out of a product that would have held it safely, or
 * put it in the one place it must not go.
 */
export function NotUsedByAssistantNotice() {
  const t = useTranslations('vault.notices');

  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <Icon name="lock" size={18} className="mt-0.5 shrink-0 text-slate-500" />
      <div className="space-y-1 text-sm text-slate-700">
        <p className="font-medium text-slate-900">{t('privateTitle')}</p>
        <p>{t('privateBody')}</p>
        <p className="text-slate-600">{t('notUsedByAssistant')}</p>
      </div>
    </div>
  );
}
