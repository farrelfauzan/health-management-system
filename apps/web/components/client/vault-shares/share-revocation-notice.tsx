'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

/**
 * What revoking a share can and cannot do, stated **before** the share is
 * created (§7.3.5).
 *
 * Revocation stops every future fetch. It does not recall a copy already
 * downloaded — that is outside the system's reach, and the access log is the
 * accountability the product can actually provide. Saying so up front is the
 * difference between a promise the product keeps and one the person only
 * discovers it never made; a warning shown after the share exists would be an
 * apology rather than a choice.
 */
export function ShareRevocationNotice() {
  const t = useTranslations('vault.sharing');

  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <Icon name="info" size={18} className="mt-0.5 shrink-0 text-slate-500" />
      <p className="text-sm text-slate-700">{t('revocationLimit')}</p>
    </div>
  );
}
