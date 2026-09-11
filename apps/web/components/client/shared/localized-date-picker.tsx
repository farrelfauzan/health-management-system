'use client';

import type { ComponentProps } from 'react';
import { DatePicker } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LocalizedDatePickerProps = ComponentProps<typeof DatePicker>;

/**
 * `DatePicker` with a translated placeholder. Pass `placeholder` when the
 * field has a more specific prompt than "Pick a date".
 */
export function LocalizedDatePicker({ placeholder, ...props }: LocalizedDatePickerProps) {
  const t = useTranslations('shared.pickers');
  return <DatePicker {...props} placeholder={placeholder ?? t('pickDate')} />;
}
