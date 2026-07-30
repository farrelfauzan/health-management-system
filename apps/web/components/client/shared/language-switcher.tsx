'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from '@hms/ui';

import type { AppLocale } from '../../../i18n/config';
import { setLocale } from '#lib/i18n/set-locale';

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(nextLocale: AppLocale) {
    if (nextLocale === locale || isPending) {
      return;
    }

    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isPending}
          aria-label={isPending ? t('changing') : t('label')}
        >
          <Icon name="language" size={20} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => selectLocale('id')}>
          <span lang="id">Bahasa Indonesia</span>
          {locale === 'id' ? <Icon name="check" size={16} className="ml-auto" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => selectLocale('en')}>
          <span lang="en">English</span>
          {locale === 'en' ? <Icon name="check" size={16} className="ml-auto" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
