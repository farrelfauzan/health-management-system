'use client';

import type { ComponentProps } from 'react';
import { TimePicker } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LocalizedTimePickerProps = Omit<ComponentProps<typeof TimePicker>, 'labels'>;

/** `TimePicker` with its placeholder and column names in the UI language. */
export function LocalizedTimePicker({ placeholder, ...props }: LocalizedTimePickerProps) {
  const t = useTranslations('shared.pickers');
  return (
    <TimePicker
      {...props}
      placeholder={placeholder ?? t('pickTime')}
      labels={{ hour: t('hour'), minute: t('minute') }}
    />
  );
}
