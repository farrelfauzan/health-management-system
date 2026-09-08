'use client';

import { useState } from 'react';
import type { LabSpecimenLabel } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { labSpecimenControllerGetSpecimenLabelV1 } from '#lib/api/generated/laboratory-specimens/laboratory-specimens';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { printSpecimenLabels } from '#lib/laboratory/print-specimen-labels';

type LabPrintLabelsButtonProps = {
  specimenIds: readonly string[];
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost';
};

/** Reprints the label(s) for tubes already drawn — a smudged label is routine. */
export function LabPrintLabelsButton({
  specimenIds,
  size = 'sm',
  variant = 'outline',
}: LabPrintLabelsButtonProps) {
  const t = useTranslations('operations.laboratory');
  const locale = useLocale();
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  async function handlePrint(): Promise<void> {
    setIsPrinting(true);
    try {
      const labels = await Promise.all(
        specimenIds.map(async (id) =>
          parseApiSuccess<LabSpecimenLabel>(
            await labSpecimenControllerGetSpecimenLabelV1(id),
            t('labels.error'),
          ).data,
        ),
      );
      if (!printSpecimenLabels(labels, locale)) {
        toast.warning(t('collect.popupBlocked'));
      }
    } catch (caughtError) {
      notifyApiError(caughtError, t('labels.error'));
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handlePrint}
      disabled={isPrinting || specimenIds.length === 0}
    >
      <Icon name="print" size={16} />
      {specimenIds.length === 1 ? t('labels.printOne') : t('labels.print')}
    </Button>
  );
}
