'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  doctorCredentialCodeSchema,
  type DoctorCredentialKindValue,
  type DoctorCredentialOption,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { RequiredLegend } from '#components/client/shared/required-legend';
import { doctorCredentialOptionControllerCreateDoctorCredentialOptionV1 } from '#lib/api/generated/doctor-credential-options/doctor-credential-options';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDoctorCredentialOptions } from '#lib/doctors/invalidate-doctor-credential-options';

type DoctorCredentialOptionDialogProps = {
  open: boolean;
  /** The list being extended; the dialog only ever adds to the open tab. */
  kind: DoctorCredentialKindValue;
  onOpenChange: (open: boolean) => void;
};

/**
 * Adds one option to a list. Create only, deliberately: the code is what every
 * doctor profile stores, so it is fixed at creation, and the label and sort
 * order are edited from the row rather than here.
 */
export function DoctorCredentialOptionDialog({
  open,
  kind,
  onOpenChange,
}: DoctorCredentialOptionDialogProps) {
  const t = useTranslations('operations.doctorCredentials');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('0');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: { code: string; label: string; sortOrder: number }) =>
      doctorCredentialOptionControllerCreateDoctorCredentialOptionV1({ kind, ...payload }),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const parsedCode = doctorCredentialCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setActionError(t('codeRequired'));
      return;
    }
    const trimmedLabel = label.trim();
    if (trimmedLabel.length === 0) {
      setActionError(t('labelRequired'));
      return;
    }
    const parsedSortOrder = Number(sortOrder.trim());
    try {
      const response = await saveMutation.mutateAsync({
        code: parsedCode.data,
        label: trimmedLabel,
        sortOrder: Number.isInteger(parsedSortOrder) && parsedSortOrder >= 0 ? parsedSortOrder : 0,
      });
      parseApiSuccess<DoctorCredentialOption>(response, t('saveError'));
      await invalidateDoctorCredentialOptions(queryClient);
      toast.success(t('saved'));
      onOpenChange(false);
    } catch (caughtError) {
      setActionError(notifyApiError(caughtError, t('saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-4 py-4">
            <RequiredLegend />
            {actionError ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {actionError}
              </p>
            ) : null}
            <div className="space-y-1 text-sm text-slate-700">
              <FormLabel htmlFor="doctor-credential-kind">{t('fields.kind')}</FormLabel>
              <Input id="doctor-credential-kind" value={t(`kinds.${kind}`)} readOnly disabled />
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <FormLabel htmlFor="doctor-credential-code" required>
                {t('fields.code')}
              </FormLabel>
              <Input
                id="doctor-credential-code"
                value={code}
                placeholder="SP_PD"
                disabled={saveMutation.isPending}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
              <p className="text-xs text-slate-500">{t('codeHint')}</p>
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <FormLabel htmlFor="doctor-credential-label" required>
                {t('fields.label')}
              </FormLabel>
              <Input
                id="doctor-credential-label"
                value={label}
                placeholder="Sp.PD"
                disabled={saveMutation.isPending}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <FormLabel htmlFor="doctor-credential-sort-order">{t('fields.sortOrder')}</FormLabel>
              <Input
                id="doctor-credential-sort-order"
                inputMode="numeric"
                value={sortOrder}
                disabled={saveMutation.isPending}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tCommon('saving') : t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
