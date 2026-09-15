'use client';

import type { DoctorAuthorityKindValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

type MidwifeAuthorityRefusalNoticeProps = {
  kind: DoctorAuthorityKindValue;
};

/**
 * The inline refusal when a midwife lacks the delegated authority an action
 * needs (P25-T03): which authority, and where the patient goes instead.
 * Shared by the open-encounter dialog and the procedure form.
 */
export function MidwifeAuthorityRefusalNotice({ kind }: MidwifeAuthorityRefusalNoticeProps) {
  const t = useTranslations('clinical');
  return (
    <InlineNotice
      tone="error"
      data-testid="midwife-authority-refusal"
      title={t('encounters.midwifeAuthority.refused', {
        kind: t(`doctors.authorities.kind.${kind}`),
      })}
    >
      {t('encounters.midwifeAuthority.referral')}
    </InlineNotice>
  );
}
