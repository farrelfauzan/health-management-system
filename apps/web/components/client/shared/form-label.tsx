'use client';

import type { ComponentProps } from 'react';
import { Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type FormLabelProps = Omit<ComponentProps<typeof Label>, 'requiredText'>;

/**
 * `Label` from `@hms/ui` with the screen-reader "required" word translated for
 * the active locale, so a form only has to pass `required` and nothing else.
 */
export function FormLabel(props: FormLabelProps) {
  const t = useTranslations('shared.form');
  return <Label requiredText={t('required')} {...props} />;
}
