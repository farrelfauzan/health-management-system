'use client';

import { useState } from 'react';
import type { ProspectivePatientView } from '@hms/shared-types';
import { Button, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ProspectiveArrivalDrawer } from '#components/client/channel-arrivals/prospective-arrival-drawer';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import type { PatientConversionResult } from '#lib/prospective-arrivals/patient-conversion-result';

type ProspectivePatientRowActionsProps = {
  item: ProspectivePatientView;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

const PATIENT_DETAIL_BASE_PATH = '/admin/patients';

/**
 * The two resolutions the counter has, offered from the back office
 * (`P19-T08`), reusing the pieces `P17-T04` built.
 *
 * **Convert** opens the ordinary patient form pre-filled from the enquiry, so
 * the record it creates answers to the same validation and the same
 * privacy-notice capture as any other, and the conversion endpoint retires the
 * enquiry in the transaction that spends the MRN.
 *
 * **Link** opens the arrival drawer, which searches the registry seeded from
 * the booking's own name and number and links per candidate. The merge dialog
 * the ticket names is not the right tool here: it folds a *draft patient
 * profile* into another record, and a prospective row has no profile to fold.
 *
 * The two carry the permissions their endpoints do — `patient.create` and
 * `patient.update` — so a person who may only link never sees the button that
 * spends a number. A resolved row links to the record it became instead.
 */
export function ProspectivePatientRowActions({
  item,
  onResult,
  onFailed,
}: ProspectivePatientRowActionsProps) {
  const t = useTranslations('prospectivePatients');
  const ability = useAbility();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const canConvert = ability.can('create', 'Patient');
  const canLink = ability.can('update', 'Patient');

  function handleConverted(result: PatientConversionResult): void {
    onResult(
      t('converted', { name: result.resolution.patientFullName, mrn: result.resolution.mrn }),
    );
    // Shown separately rather than swallowed: the record is committed by the
    // time a NIK warning exists, and it is worth fixing on the edit screen.
    if (result.identifierWarnings.length > 0) {
      onFailed(result.identifierWarnings.join(' · '));
    }
  }

  if (item.status !== 'AWAITING_ARRIVAL') {
    if (item.patientId === null) {
      return <span className="block text-right text-sm text-slate-400">—</span>;
    }
    return (
      <div className="flex items-center justify-end">
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={`${PATIENT_DETAIL_BASE_PATH}/${item.patientId}`}>{t('actions.openRecord')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {canLink ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsDrawerOpen(true)}>
          {t('actions.link')}
        </Button>
      ) : null}
      {canConvert ? (
        <Button type="button" size="sm" onClick={() => setIsFormOpen(true)}>
          {t('actions.convert')}
        </Button>
      ) : null}
      {canLink ? (
        <ProspectiveArrivalDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          arrival={{ patientFullName: item.fullName, patientPhoneNumber: item.phoneNumber }}
          prospectivePatientId={item.id}
          onResolved={onResult}
          onFailed={onFailed}
        />
      ) : null}
      {canConvert && isFormOpen ? (
        <PatientFormDialog
          key={`convert-${item.id}`}
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          conversion={{
            prospectivePatientId: item.id,
            fullName: item.fullName,
            phoneNumber: item.phoneNumber,
          }}
          onConverted={handleConverted}
        />
      ) : null}
    </div>
  );
}
