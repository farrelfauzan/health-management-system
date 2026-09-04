'use client';

import { Button, Icon } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

type OffboardingBannerProps = {
  /** Clinic calendar day, `YYYY-MM-DD`. */
  deadline: string;
  vaultHref: string;
};

/**
 * The in-window notice (P16-T41, §7.3.10): the date, what is deleted then,
 * what survives, and the one thing to do about it.
 *
 * Rendered above every page the person can still reach — which is one page,
 * their vault — because the email that said the same thing may have been
 * read in a hurry, and the export button below this banner is the whole
 * reason the window exists. It does not say "your account was deactivated":
 * it was not, and the difference is the month of access this banner sits in.
 */
export function OffboardingBanner({ deadline, vaultHref }: OffboardingBannerProps) {
  const t = useTranslations('vault.offboarding');
  const format = useFormatter();
  const date = format.dateTime(new Date(`${deadline}T00:00:00.000Z`), {
    dateStyle: 'long',
    timeZone: 'UTC',
  });

  return (
    <div
      role="status"
      className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:px-8"
    >
      <Icon name="schedule" size={20} className="shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1 space-y-0.5 text-sm text-amber-900">
        <p className="font-medium">{t('title', { date })}</p>
        <p>{t('body')}</p>
      </div>
      <Button asChild variant="outline" className="shrink-0 border-amber-300 bg-white">
        <Link href={vaultHref}>
          <Icon name="archive" size={18} />
          {t('cta')}
        </Link>
      </Button>
    </div>
  );
}
