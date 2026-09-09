'use client';

import type { DocumentTemplateImportWarning } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

type TemplateImportWarningsProps = {
  warnings: readonly DocumentTemplateImportWarning[];
  onDismiss: () => void;
};

/**
 * What the Word import could not carry over (P16-T42), shown above the
 * editor until the author dismisses it or saves: unknown placeholders left
 * as text, images that were dropped, and anything the converter skipped.
 */
export function TemplateImportWarnings({ warnings, onDismiss }: TemplateImportWarningsProps) {
  const t = useTranslations('operations.billing.templates.import');
  if (warnings.length === 0) {
    return null;
  }
  return (
    <InlineNotice tone="warning" title={t('warningsTitle', { count: warnings.length })}>
      <div className="space-y-2">
        <ul className="space-y-1">
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`} className="flex items-start gap-1.5">
              <Icon name="warning" size={14} />
              <span>
                {t(`codes.${warning.code}`, { detail: warning.detail ?? warning.message })}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs">{t('reviewHint')}</p>
        <button
          type="button"
          className="text-xs font-medium underline underline-offset-2"
          onClick={onDismiss}
          aria-label={t('dismiss')}
        >
          {t('dismiss')}
        </button>
      </div>
    </InlineNotice>
  );
}
