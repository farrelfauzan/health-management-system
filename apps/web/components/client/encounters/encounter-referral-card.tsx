'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@hms/ui';

import { EncounterReferralForm } from '#components/client/encounters/encounter-referral-form';
import { encounterClinicalDataControllerRemoveBpjsReferralV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { useBpjsReferral } from '#lib/encounters/use-bpjs-referral';
import { formatMediumDate } from '#lib/shared/format-medium-date';

const RETRACT_ERROR_FALLBACK = 'Unable to retract the referral. Please try again.';

type EncounterReferralCardProps = {
  encounterId: string;
  isEditable: boolean;
};

export function EncounterReferralCard({ encounterId, isEditable }: EncounterReferralCardProps) {
  const queryClient = useQueryClient();
  const referralQuery = useBpjsReferral(encounterId, true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: () => encounterClinicalDataControllerRemoveBpjsReferralV1(encounterId),
  });
  const referral = referralQuery.referral;

  async function handleRemove(): Promise<void> {
    setActionError(null);
    try {
      await removeMutation.mutateAsync();
      await invalidateEncounterQueries(queryClient);
    } catch (error) {
      setActionError(notifyApiError(error, RETRACT_ERROR_FALLBACK));
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading text-base">BPJS Referral (Rujukan)</CardTitle>
        {isEditable && !isEditing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsEditing(true)}>
            {referral ? 'Edit Referral' : 'Record Referral'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}
        {isEditing ? (
          <EncounterReferralForm
            encounterId={encounterId}
            referral={referral}
            onSaved={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
          />
        ) : referralQuery.isPending ? (
          <p className="text-sm text-slate-500">Loading referral...</p>
        ) : referral ? (
          <div className="space-y-1.5">
            <p className="text-sm text-slate-700">
              To <span className="font-mono font-medium">{referral.destinationProviderCode}</span> on{' '}
              {formatMediumDate(referral.estimatedReferralDate)}
            </p>
            <p className="text-sm text-slate-600">
              {referral.subSpecialtyCode ? `Subspesialis ${referral.subSpecialtyCode}` : null}
              {referral.subSpecialtyCode && referral.khususCode ? ' · ' : null}
              {referral.khususCode ? `Khusus/TACC ${referral.khususCode}` : null}
              {referral.saranaCode ? ` · Sarana ${referral.saranaCode}` : null}
            </p>
            {referral.notes ? <p className="text-xs text-slate-500">{referral.notes}</p> : null}
            <p className="text-xs text-slate-400">
              The kunjungan will report rujuk lanjut instead of a normal outpatient discharge.
            </p>
            {isEditable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removeMutation.isPending}
                onClick={() => void handleRemove()}
              >
                {removeMutation.isPending ? 'Retracting...' : 'Retract Referral'}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No referral recorded. The visit reports as a normal outpatient discharge.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
