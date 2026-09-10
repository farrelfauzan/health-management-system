'use client';

import { useState } from 'react';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';

/**
 * The "Add New Patient" button and the form it opens, as one unit.
 *
 * Lifted out of the directory panel (`P19-T08`) so the patients page header
 * can sit above the tab strip while the button keeps owning its own dialog
 * state; the caller decides whether this person may see it.
 */
export function PatientsCreateButton() {
  const t = useTranslations('clinical');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);

  return (
    <>
      <Button
        type="button"
        className="bg-primary-container hover:bg-primary"
        onClick={() => setIsFormDialogOpen(true)}
      >
        <Icon name="person_add" size={18} />
        {t('patients.add')}
      </Button>
      {isFormDialogOpen ? (
        <PatientFormDialog key="create" open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen} />
      ) : null}
    </>
  );
}
