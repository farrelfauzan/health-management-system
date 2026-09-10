'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type BulkSubmitCorpusButtonProps = {
  /** How many rows the selection holds; zero disables the control. */
  count: number;
  onOpen: () => void;
};

/**
 * Opens the submit dialog for a whole selection (`P19`, R-18).
 *
 * Its own file, per the one-component-per-file rule, and its own control
 * rather than a row action repeated: onboarding a twenty-eight document
 * corpus should not cost twenty-eight dialogs, which is the same asymmetry
 * bulk upload already removed from the other end of this screen.
 */
export function BulkSubmitCorpusButton({ count, onOpen }: BulkSubmitCorpusButtonProps) {
  const t = useTranslations('clinicCorpus.approval.bulk');

  return (
    <Button type="button" size="sm" disabled={count === 0} onClick={onOpen}>
      <Icon name="rate_review" size={18} />
      {t('action', { count })}
    </Button>
  );
}
