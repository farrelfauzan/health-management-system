'use client';

import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

export function PreviewBadge() {
  const t = useTranslations('aiAssistant.preview');
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-700"
      title={t('description')}
    >
      {t('label')}
    </Badge>
  );
}
