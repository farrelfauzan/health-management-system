'use client';

import type { ComponentProps } from 'react';
import { MonthPicker } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

type LocalizedMonthPickerProps = Omit<ComponentProps<typeof MonthPicker>, 'labels' | 'locale'>;

/**
 * `MonthPicker` in the UI language: month names follow the active locale, so
 * an Indonesian reader sees "Okt 2026", not "Oct 2026".
 */
export function LocalizedMonthPicker({ placeholder, ...props }: LocalizedMonthPickerProps) {
  const t = useTranslations('shared.pickers');
  const locale = useLocale();
  return (
    <MonthPicker
      {...props}
      locale={locale}
      placeholder={placeholder ?? t('pickMonth')}
      labels={{ previousYear: t('previousYear'), nextYear: t('nextYear') }}
    />
  );
}
