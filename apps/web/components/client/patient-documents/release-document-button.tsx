'use client';

import { useState } from 'react';
import type { PatientDocumentView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useReleaseDocument } from '#lib/patient-documents/use-release-document';

type ReleaseDocumentButtonProps = {
  patientId: string;
  document: PatientDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * Releases one file to the patient's portal (FR-E2-13, US-E2-04).
 *
 * **Confirmed, and the confirmation names the consequence in the patient's
 * terms** — the patient will see this — rather than asking "are you sure".
 * Releasing is the moment a result stops being a clinical document and becomes
 * something a person reads at home, possibly alone, possibly a frightening
 * number with nobody to ask. A dialog that only said "confirm" would not be
 * telling the clinician what they are deciding.
 *
 * There is no un-release: the API has no such route, and offering an undo the
 * server cannot honour would be worse than not offering one. The dialog says
 * so, because that is exactly what a clinician needs to know *before* clicking
 * rather than after.
 *
 * Visibility is CASL only (`release` on `PatientDocument`); the backend guard,
 * which additionally requires an active assignment, is what actually refuses —
 * so a refusal is surfaced rather than pre-empted.
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
  const releaseMutation = useReleaseDocument({
    patientId,
    errorMessage: t('error'),
    onError,
    onSuccess: () => {
      setIsOpen(false);
      onResult(t('released'));
    },
  });

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
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmBody', { title: document.title })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-500">{t('noUndo')}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(document.id)}
            >
              {releaseMutation.isPending ? t('releasing') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
