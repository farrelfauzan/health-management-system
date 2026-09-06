'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type SubmitDocumentTriggerProps = {
  onOpen: () => void;
};

/** Opens the submit dialog. Its own file, per the one-component-per-file rule. */
export function SubmitDocumentTrigger({ onOpen }: SubmitDocumentTriggerProps) {
  const t = useTranslations('operations.documents.approvals.submit');

  return (
    <Button type="button" onClick={onOpen}>
      <Icon name="how_to_reg" size={18} />
      {t('action')}
    </Button>
  );
}
