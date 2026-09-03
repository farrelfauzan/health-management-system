'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

/**
 * The upload-time warning that a patient's file belongs in the patient's
 * record, not here (§7.3.11).
 *
 * Mirrors the knowledge base's `NoPatientDataNotice` for a different reason.
 * There, patient data must stay out because the corpus reaches an AI
 * provider. Here it must stay out because a vault is nobody's medical record:
 * a lab result filed in a doctor's private drawer is invisible to the
 * patient, to their other clinicians, and to every retention rule the RME
 * regulations impose — it is not protected by being private, it is lost.
 *
 * Rendered above the file picker rather than below the submit button: a
 * warning has to be read before a file is chosen, not acknowledged after.
 */
export function VaultPatientDataNotice() {
  const t = useTranslations('vault.notices');

  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-amber-600" />
      <p className="text-sm text-amber-900">{t('noPatientData')}</p>
    </div>
  );
}
