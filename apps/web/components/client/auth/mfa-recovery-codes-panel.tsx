'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@hms/ui';

type MfaRecoveryCodesPanelProps = {
  recoveryCodes: string[];
  onAcknowledge: () => void;
};

/**
 * Shows the recovery codes, once (SJ-8).
 *
 * The server keeps only hashes, so this render is the single moment the
 * plaintext exists anywhere. The acknowledge button is deliberately the only
 * way forward and is worded as a confirmation rather than a dismissal — a user
 * who clicks past this screen has lost their fallback, and the next time they
 * need one will be the time they cannot reach their phone.
 */
export function MfaRecoveryCodesPanel({
  recoveryCodes,
  onAcknowledge,
}: MfaRecoveryCodesPanelProps) {
  const t = useTranslations('authShell.auth.mfa.recoveryCodes');

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('description')}</p>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {recoveryCodes.map((recoveryCode) => (
          <li key={recoveryCode} className="font-mono text-sm tracking-tight text-slate-800">
            {recoveryCode}
          </li>
        ))}
      </ul>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('warning')}
      </p>

      <Button
        type="button"
        onClick={onAcknowledge}
        className="w-full bg-primary-container text-white hover:bg-primary"
      >
        {t('acknowledge')}
      </Button>
    </section>
  );
}
