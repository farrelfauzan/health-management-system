'use client';

import type { ComponentProps } from 'react';
import { DateTimePicker } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LocalizedDateTimePickerProps = Omit<ComponentProps<typeof DateTimePicker>, 'labels'>;

/** `DateTimePicker` with both halves' placeholders and column names translated. */
export function LocalizedDateTimePicker(props: LocalizedDateTimePickerProps) {
  const t = useTranslations('shared.pickers');
  return (
    <DateTimePicker
      {...props}
      labels={{
        datePlaceholder: t('pickDate'),
        timePlaceholder: t('pickTime'),
        hour: t('hour'),
        minute: t('minute'),
      }}
    />
  );
}
