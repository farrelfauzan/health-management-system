'use client';

import { useTranslations } from 'next-intl';

type TemplatePublishErrorsProps = {
  unknownTokens: readonly string[];
  onDismiss: () => void;
};

/**
 * The blocking publish error, rendered beside the action rather than as a
 * toast: the author has to find and fix every listed token, so the list
 * must stay on screen while they do.
 */
export function TemplatePublishErrors({ unknownTokens, onDismiss }: TemplatePublishErrorsProps) {
  const t = useTranslations('operations.billing.templates.publish');
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
      data-testid="template-publish-errors"
    >
      <p className="font-medium">{t('unknownTokensTitle', { count: unknownTokens.length })}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {unknownTokens.map((token) => (
          <li key={token}>
            <code className="font-mono text-xs">{`{{${token}}}`}</code>
          </li>
        ))}
      </ul>
      <p className="text-xs text-rose-700">{t('unknownTokensHint')}</p>
      <button
        type="button"
        className="text-xs font-medium underline underline-offset-2"
        onClick={onDismiss}
      >
        {t('dismiss')}
      </button>
    </div>
  );
}
