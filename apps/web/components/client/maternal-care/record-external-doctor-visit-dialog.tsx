'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { pregnancyEpisodeControllerRecordExternalDoctorVisitV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';

type RecordExternalDoctorVisitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
};

/**
 * What the Buku KIA can tell the midwife about a doctor visit made elsewhere:
 * where, when, and whether an ultrasound was done (FR-ANC-07). Nothing more,
 * because nothing more is knowable from a book.
 */
export function RecordExternalDoctorVisitDialog({
  open,
  onOpenChange,
  episodeId,
}: RecordExternalDoctorVisitDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [facilityName, setFacilityName] = useState<string>('');
  const [visitedAt, setVisitedAt] = useState<string>('');
  const [isUltrasoundDone, setIsUltrasoundDone] = useState<boolean>(false);

  const mutation = useMutation({
    mutationFn: async () =>
      pregnancyEpisodeControllerRecordExternalDoctorVisitV1(episodeId, {
        facilityName,
        visitedAt,
        isUltrasoundDone,
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('maternalCare.actions.recordExternalDoctorVisit'));
      onOpenChange(false);
    },
    onError: (error) => notifyApiError(error, t('maternalCare.loadError')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('maternalCare.actions.recordExternalDoctorVisit')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="facility-name" required>
              {t('maternalCare.externalDoctorVisits.facilityName')}
            </FormLabel>
            <Input
              id="facility-name"
              value={facilityName}
              onChange={(event) => setFacilityName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <FormLabel htmlFor="visited-at" required>
              {t('maternalCare.externalDoctorVisits.visitedAt')}
            </FormLabel>
            <DatePicker id="visited-at" value={visitedAt} onValueChange={setVisitedAt} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ultrasound-done"
              checked={isUltrasoundDone}
              onCheckedChange={(checked) => setIsUltrasoundDone(checked === true)}
            />
            <FormLabel htmlFor="ultrasound-done">
              {t('maternalCare.externalDoctorVisits.isUltrasoundDone')}
            </FormLabel>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('maternalCare.form.cancel')}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || facilityName.length === 0 || visitedAt.length === 0}
            onClick={() => mutation.mutate()}
          >
            {t('maternalCare.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
