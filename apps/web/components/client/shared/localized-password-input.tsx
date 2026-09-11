'use client';

import type { ComponentProps } from 'react';
import { PasswordInput } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LocalizedPasswordInputProps = Omit<ComponentProps<typeof PasswordInput>, 'labels'>;

/** `PasswordInput` with the show/hide button named in the UI language. */
export function LocalizedPasswordInput(props: LocalizedPasswordInputProps) {
  const t = useTranslations('shared.password');
  return <PasswordInput {...props} labels={{ show: t('show'), hide: t('hide') }} />;
}
