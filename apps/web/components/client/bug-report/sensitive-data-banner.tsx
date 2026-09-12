'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

/**
 * The warning that cannot be dismissed (P23-T11).
 *
 * Layer 1 of `docs/security/ai-vendor-dpa.md` §5c, and the only layer that
 * addresses the risk the other three cannot: patterns catch a NIK and a phone
 * number, and they will never catch "Pasien Bu Ani di kamar 3". §5c is candid
 * that layer 1 is a person reading a warning while something is going wrong —
 * which is exactly why it is not dismissable and not collapsible, and why it
 * names the categories rather than saying "do not include sensitive data".
 */
export function SensitiveDataBanner() {
  const t = useTranslations('authShell.bugReport');
  return (
    <div
      role="note"
      className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
      <p>{t('warning')}</p>
    </div>
  );
}
