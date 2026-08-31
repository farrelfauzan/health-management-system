'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChannelArrivalView } from '@hms/shared-types';
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ProspectiveMatchCandidateRow } from '#components/client/channel-arrivals/prospective-match-candidate-row';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import { prospectivePatientControllerLinkToExistingPatientV1 } from '#lib/api/generated/customer-service/customer-service';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateProspectiveArrivalQueries } from '#lib/prospective-arrivals/invalidate-prospective-arrival-queries';
import type { PatientConversionResult } from '#lib/prospective-arrivals/patient-conversion-result';
import { useProspectiveMatchCandidates } from '#lib/prospective-arrivals/use-prospective-match-candidates';

type ProspectiveArrivalDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  arrival: ChannelArrivalView;
  /**
   * Passed explicitly rather than read off `arrival`, which carries it as
   * nullable: this drawer is only ever opened for a prospective booking, and
   * taking the id as a required prop makes the other case unrepresentable
   * instead of letting a `null` reach the endpoint as the string "null".
   */
  prospectivePatientId: string;
  onResolved: (message: string) => void;
  onFailed: (message: string) => void;
};

const SEARCH_RESULT_LIMIT = 8;

/**
 * Arrival conversion at the counter (`P17-T04`, strategy §5.2).
 *
 * **Search first, and the layout says so.** The candidate list is the body of
 * the drawer and *Register as a new patient* is at the bottom, disabled until
 * a search has actually come back. That ordering is the entire feature: the
 * person standing at the counter is very often already a patient who booked
 * from a phone the registry has never seen, and registering them again creates
 * a second medical record that PMK 24/2022 retention then makes permanent.
 *
 * The search runs on open with nothing typed, seeded by the API from the
 * booking's own name and number. A search a clerk has to initiate is a search
 * that gets skipped when the queue is six deep.
 *
 * The two outcomes are deliberately asymmetric in weight. *Link* is one click
 * per candidate and spends nothing. *Register* opens the full patient form,
 * with its required demographics and its privacy-notice capture, because that
 * is the click that allocates an MRN.
 */
export function ProspectiveArrivalDrawer({
  open,
  onOpenChange,
  arrival,
  prospectivePatientId,
  onResolved,
  onFailed,
}: ProspectiveArrivalDrawerProps) {
  const t = useTranslations('channelArrivals.prospective');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [nik, setNik] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const candidatesQuery = useProspectiveMatchCandidates({
    prospectivePatientId: open ? prospectivePatientId : null,
    search,
    nik,
    limit: SEARCH_RESULT_LIMIT,
  });
  const linkMutation = useMutation({
    mutationFn: async (patientId: string) => {
      await prospectivePatientControllerLinkToExistingPatientV1(prospectivePatientId, {
        patientId,
      });
    },
    onSuccess: async () => {
      onOpenChange(false);
      await invalidateProspectiveArrivalQueries(queryClient);
      onResolved(t('linked'));
    },
    onError: (error: unknown) => {
      onFailed(resolveApiErrorMessage(error, t('linkFailed')));
    },
  });
  // The gate the ticket asks for: until one search has completed, the desk has
  // seen no candidates and cannot know whether this person is already a
  // patient — so the button that spends an MRN stays shut.
  const hasSearched = candidatesQuery.isSuccess;

  function handleConverted(result: PatientConversionResult): void {
    onOpenChange(false);
    onResolved(
      t('converted', {
        name: result.resolution.patientFullName,
        mrn: result.resolution.mrn,
      }),
    );
    // Reported separately rather than swallowed: a NIK that disagrees with the
    // birth date is worth correcting on the patient-edit screen, and the record
    // is already committed by the time it is known.
    if (result.identifierWarnings.length > 0) {
      onFailed(result.identifierWarnings.join(' · '));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>
            {t('description', {
              name: arrival.patientFullName,
              phone: arrival.patientPhoneNumber,
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prospective-arrival-search">{t('searchLabel')}</Label>
              <Input
                id="prospective-arrival-search"
                value={search}
                placeholder={t('searchPlaceholder')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospective-arrival-nik">{t('nikLabel')}</Label>
              <Input
                id="prospective-arrival-nik"
                value={nik}
                inputMode="numeric"
                placeholder={t('nikPlaceholder')}
                onChange={(event) => setNik(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('seededHint')}</p>
          {candidatesQuery.isLoading ? (
            <p className="text-sm text-slate-500">{t('searching')}</p>
          ) : candidatesQuery.isError ? (
            <p className="text-sm text-red-700">{t('searchFailed')}</p>
          ) : candidatesQuery.candidates.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noCandidates')}</p>
          ) : (
            <ul className="space-y-2">
              {candidatesQuery.candidates.map((candidate) => (
                <ProspectiveMatchCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isLinking={linkMutation.isPending}
                  onLink={(patientId) => linkMutation.mutate(patientId)}
                />
              ))}
            </ul>
          )}
        </div>
        <SheetFooter>
          <p className="text-xs text-slate-500">
            {hasSearched ? t('createHint') : t('searchFirstHint')}
          </p>
          <Button type="button" disabled={!hasSearched} onClick={() => setIsFormOpen(true)}>
            {t('createNew')}
          </Button>
        </SheetFooter>
        <PatientFormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          conversion={{
            prospectivePatientId,
            fullName: arrival.patientFullName,
            phoneNumber: arrival.patientPhoneNumber,
          }}
          onConverted={handleConverted}
        />
      </SheetContent>
    </Sheet>
  );
}
