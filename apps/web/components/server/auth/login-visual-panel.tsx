import { getTranslations } from 'next-intl/server';

import { AnimatedBrandMark } from '#components/client/shared/animated-brand-mark';
import { BrandWordmark } from '#components/shared/brand-wordmark';
import { FACILITY_CONFIG } from '#lib/facility/facility-config';

/**
 * The branded half of the login screen. Deliberately light: the mark's
 * ribbons multiply into deeper tones on a light surface, and the wordmark is
 * navy. Hovering the mark eases it from the calm ring into a listening wave.
 */
export async function LoginVisualPanel() {
  const t = await getTranslations('authShell.auth');
  return (
    <section className="relative hidden overflow-hidden bg-surface lg:flex lg:items-center lg:justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-surface-container-high blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-secondary-container/40 blur-3xl"
      />
      <div className="relative flex w-full max-w-lg flex-col items-center gap-8 px-12">
        <div className="flex flex-col items-center gap-6">
          <AnimatedBrandMark
            size={240}
            label={t('brand.visualAlt', { facilityName: FACILITY_CONFIG.name })}
          />
          <div className="flex flex-col items-center gap-3">
            <BrandWordmark className="text-5xl" />
            <span className="text-sm font-medium tracking-wide text-on-surface-variant">
              {t('brand.systemName')}
            </span>
          </div>
        </div>
        <p className="max-w-sm text-center text-sm leading-relaxed text-on-surface-variant">
          {t('visualDescription')}
        </p>
      </div>
    </section>
  );
}
