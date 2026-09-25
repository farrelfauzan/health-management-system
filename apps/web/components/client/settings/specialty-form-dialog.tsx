'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { specialtyNameSchema, type Specialty } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { RequiredLegend } from '#components/client/shared/required-legend';
import {
  specialtyControllerCreateSpecialtyV1,
  specialtyControllerUpdateSpecialtyV1,
} from '#lib/api/generated/specialty/specialty';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateSpecialties } from '#lib/specialties/invalidate-specialties';
import { resolveSpecialtyErrorMessage } from '#lib/specialties/resolve-specialty-error-message';
import { useSpecialtyErrorMessages } from '#lib/specialties/use-specialty-error-messages';

type SpecialtyFormDialogProps = {
  open: boolean;
  /** The poli being renamed; absent when adding one. */
  specialty?: Specialty;
  onOpenChange: (open: boolean) => void;
};

/** Adds a poli, or renames and re-describes one. */
export function SpecialtyFormDialog({ open, specialty, onOpenChange }: SpecialtyFormDialogProps) {
  const t = useTranslations('operations.specialties');
  const tCommon = useTranslations('operations.common');
  const errorMessages = useSpecialtyErrorMessages();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>(specialty?.name ?? '');
  const [description, setDescription] = useState<string>(specialty?.description ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      specialty
        ? specialtyControllerUpdateSpecialtyV1(specialty.id, {
            name: payload.name,
            description: payload.description === '' ? null : payload.description,
          })
        : specialtyControllerCreateSpecialtyV1({
            name: payload.name,
            ...(payload.description === '' ? {} : { description: payload.description }),
          }),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const parsedName = specialtyNameSchema.safeParse(name);
    if (!parsedName.success) {
      setActionError(t('nameRequired'));
      return;
    }
    try {
      const response = await saveMutation.mutateAsync({
        name: parsedName.data,
        description: description.trim(),
      });
      parseApiSuccess<Specialty>(response, t('saveError'));
      await invalidateSpecialties(queryClient);
      toast.success(t('saved'));
      onOpenChange(false);
    } catch (caughtError) {
      const message = resolveSpecialtyErrorMessage(caughtError, errorMessages);
      notifyStatement({ tone: 'error', title: message });
      setActionError(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {t(specialty ? 'editTitle' : 'createTitle')}
          </DialogTitle>
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
              <FormLabel htmlFor="specialty-name" required>
                {t('fields.name')}
              </FormLabel>
              <Input
                id="specialty-name"
                value={name}
                placeholder={t('namePlaceholder')}
                disabled={saveMutation.isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <FormLabel htmlFor="specialty-description">{t('fields.description')}</FormLabel>
              <Textarea
                id="specialty-description"
                value={description}
                disabled={saveMutation.isPending}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? tCommon('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
