'use client';

import { useState } from 'react';
import type { ChannelArrivalView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ChannelArrivalMergeDialog } from '#components/client/channel-arrivals/channel-arrival-merge-dialog';

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
 */
export function ChannelArrivalRowActions({
  arrival,
  onResult,
  onFailed,
}: ChannelArrivalRowActionsProps) {
  const t = useTranslations('channelArrivals.actions');
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild type="button" variant="outline" size="sm">
        <Link href={`/admin/patients/${arrival.patientId}`}>{t('complete')}</Link>
      </Button>
      {arrival.patientIsDraft ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsMergeOpen(true)}>
          {t('merge')}
        </Button>
      ) : null}
      <ChannelArrivalMergeDialog
        open={isMergeOpen}
        onOpenChange={setIsMergeOpen}
        arrival={arrival}
        onMerged={onResult}
        onFailed={onFailed}
      />
    </div>
  );
}
