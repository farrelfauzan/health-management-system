'use client';

import { useState } from 'react';
import type { ChannelArrivalView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ChannelArrivalMergeDialog } from '#components/client/channel-arrivals/channel-arrival-merge-dialog';
import { ProspectiveArrivalDrawer } from '#components/client/channel-arrivals/prospective-arrival-drawer';

type ChannelArrivalRowActionsProps = {
  arrival: ChannelArrivalView;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * The two things a desk does with a chat booking at arrival (§5.2).
 *
 * "Complete" is a **link to the patient record**, not a form here. Entering a
 * NIK, a BPJS number, and demographics is the existing patient-edit screen's
 * job, with its own permission, its own validation, and its own identifier
 * encryption — a second form for the same columns would be a second place for
 * those rules to drift, and it would let one screen both move a booking and
 * rewrite a registry record.
 *
 * "Merge" is offered only for a draft, because that is the only record this
 * endpoint will accept: a verified customer's booking already hangs off their
 * real record and has nothing to merge.
 *
 * **A prospective booking gets its own action** (`P17-T04`). Neither of the
 * other two fits: there is no patient record to complete — that is the point
 * of the row — and merge only accepts a draft profile as its source. What that
 * row needs is the conversion drawer, which searches the registry first and
 * only then offers to spend an MRN.
 */
export function ChannelArrivalRowActions({
  arrival,
  onResult,
  onFailed,
}: ChannelArrivalRowActionsProps) {
  const t = useTranslations('channelArrivals.actions');
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);

  if (arrival.prospectivePatientId !== null) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" onClick={() => setIsArrivalOpen(true)}>
          {t('registerArrival')}
        </Button>
        <ProspectiveArrivalDrawer
          open={isArrivalOpen}
          onOpenChange={setIsArrivalOpen}
          arrival={arrival}
          prospectivePatientId={arrival.prospectivePatientId}
          onResolved={onResult}
          onFailed={onFailed}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {arrival.patientId === null ? (
        <span className="text-xs text-slate-500">{t('notYetAPatient')}</span>
      ) : (
        <Button asChild type="button" variant="outline" size="sm">
          <Link href={`/admin/patients/${arrival.patientId}`}>{t('complete')}</Link>
        </Button>
      )}
      {arrival.patientIsDraft && arrival.patientId !== null && arrival.patientMrn !== null ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsMergeOpen(true)}>
            {t('merge')}
          </Button>
          <ChannelArrivalMergeDialog
            open={isMergeOpen}
            onOpenChange={setIsMergeOpen}
            arrival={arrival}
            draftPatientId={arrival.patientId}
            draftPatientMrn={arrival.patientMrn}
            onMerged={onResult}
            onFailed={onFailed}
          />
        </>
      ) : null}
    </div>
  );
}
