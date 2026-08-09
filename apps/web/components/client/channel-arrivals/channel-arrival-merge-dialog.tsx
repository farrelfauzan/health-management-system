'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChannelArrivalView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { channelArrivalControllerMergeDraftPatientV1 } from '#lib/api/generated/customer-service/customer-service';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateChannelArrivalQueries } from '#lib/channel-arrivals/invalidate-channel-arrival-queries';
import { useChannelMergeCandidates } from '#lib/channel-arrivals/use-channel-merge-candidates';

type ChannelArrivalMergeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arrival: ChannelArrivalView;
  onMerged: (message: string) => void;
  onFailed: (message: string) => void;
};

const SEARCH_RESULT_LIMIT = 8;

/**
 * §5.2's merge: the person at the counter is already a patient.
 *
 * The target is chosen by searching the registry rather than typed as an id,
 * and the search **defaults to the draft's own phone number**. That default is
 * doing real work: the case this dialog exists for is a chat that booked under
 * a number belonging to a family member, so the record the desk is looking for
 * is very often the one that number *does* match — the same match §5.1.1
 * refused to act on without proof, now being confirmed by a human looking at
 * the person.
 *
 * The confirmation names what will happen to the draft, because it is not
 * reversible from this screen: its bookings move and the record is retired.
 */
export function ChannelArrivalMergeDialog({
  open,
  onOpenChange,
  arrival,
  onMerged,
  onFailed,
}: ChannelArrivalMergeDialogProps) {
  const t = useTranslations('channelArrivals.merge');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(arrival.patientPhoneNumber);
  const [targetPatientId, setTargetPatientId] = useState<string | null>(null);
  const candidatesQuery = useChannelMergeCandidates(search, SEARCH_RESULT_LIMIT);
  // The API already excludes drafts, so the draft being merged cannot appear —
  // this filter is the belt to that braces, and costs nothing.
  const candidates = candidatesQuery.candidates.filter(
    (patient) => patient.id !== arrival.patientId,
  );
  const mergeMutation = useMutation({
    mutationFn: async (patientId: string) => {
      await channelArrivalControllerMergeDraftPatientV1(arrival.patientId, {
        targetPatientId: patientId,
      });
    },
    onSuccess: async () => {
      onOpenChange(false);
      setTargetPatientId(null);
      await invalidateChannelArrivalQueries(queryClient);
      onMerged(t('merged'));
    },
    onError: (error: unknown) => {
      onFailed(resolveApiErrorMessage(error, t('failed')));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', {
              name: arrival.patientFullName,
              mrn: arrival.patientMrn,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="channel-arrival-merge-search">{t('search')}</Label>
            <Input
              id="channel-arrival-merge-search"
              value={search}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => {
                setSearch(event.target.value);
                setTargetPatientId(null);
              }}
            />
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <li className="px-1 py-2 text-sm text-slate-500">{t('noCandidates')}</li>
            ) : (
              candidates.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => setTargetPatientId(patient.id)}
                    className={
                      targetPatientId === patient.id
                        ? 'w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-left'
                        : 'w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50'
                    }
                  >
                    <span className="block text-sm font-medium text-slate-900">
                      {patient.fullName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {patient.mrn} · {patient.phoneNumber}
                      {patient.dateOfBirth === null ? '' : ` · ${patient.dateOfBirth}`}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-slate-500">{t('irreversible')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={targetPatientId === null || mergeMutation.isPending}
            onClick={() => {
              if (targetPatientId !== null) {
                mergeMutation.mutate(targetPatientId);
              }
            }}
          >
            {mergeMutation.isPending ? t('merging') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
