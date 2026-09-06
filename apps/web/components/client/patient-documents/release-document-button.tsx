'use client';

import { useState } from 'react';
import type { PatientDocumentView } from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ReleaseDocumentDialog } from '#components/client/patient-documents/release-document-dialog';

type ReleaseDocumentButtonProps = {
  patientId: string;
  document: PatientDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * Releases one file to the patient's portal (FR-E2-13, US-E2-04) and, since
 * `P16-T40`, offers to send it to the patient in the same action (§7.4.5).
 *
 * **Confirmed, and the confirmation names the consequence in the patient's
 * terms** — the patient will see this — rather than asking "are you sure".
 * Releasing is the moment a result stops being a clinical document and
 * becomes something a person reads at home, possibly alone. The dispatch
 * options sit under that sentence in the dialog; the clinician's release
 * decision is the gate, and sending is their call too.
 *
 * There is no un-release: the API has no such route, and offering an undo
 * the server cannot honour would be worse than not offering one.
 *
 * Visibility is CASL only (`release` on `PatientDocument`); the backend
 * guard, which additionally requires an active assignment, is what actually
 * refuses — so a refusal is surfaced rather than pre-empted.
 */
export function ReleaseDocumentButton({
  patientId,
  document,
  onResult,
  onError,
}: ReleaseDocumentButtonProps) {
  const t = useTranslations('clinical.patients.documents.release');
  const ability = useAbility();
  const [isOpen, setIsOpen] = useState(false);

  if (!ability.can('release', 'PatientDocument') || document.releasedToPatient) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('action')}
        title={t('action')}
        onClick={() => setIsOpen(true)}
      >
        <Icon name="share" size={18} />
      </Button>
      {isOpen ? (
        <ReleaseDocumentDialog
          patientId={patientId}
          document={document}
          onOpenChange={setIsOpen}
          onResult={onResult}
          onError={onError}
        />
      ) : null}
    </>
  );
}
