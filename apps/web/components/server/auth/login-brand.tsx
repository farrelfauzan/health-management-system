import { getTranslations } from 'next-intl/server';

import { AnimatedBrandMark } from '#components/client/shared/animated-brand-mark';
import { FACILITY_CONFIG } from '#lib/facility/facility-config';

/**
 * Compact brand for the form column. It carries the identity on small screens,
 * where the visual panel is hidden, and stays as a quiet mark beside the form
 * on large ones. Pointing at the mark sets it listening.
 */
export async function LoginBrand() {
  const t = await getTranslations('authShell.auth.brand');
  return (
    <div className="flex items-center gap-3">
      <AnimatedBrandMark size={44} label={t('logoAlt', { facilityName: FACILITY_CONFIG.name })} />
      <span className="flex flex-col">
        <span className="font-heading text-lg font-semibold tracking-tight text-slate-900">
          {FACILITY_CONFIG.name}
        </span>
        <span className="text-xs text-slate-500">{t('systemName')}</span>
      </span>
    </div>
  );
}
