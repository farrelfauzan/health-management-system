'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PATIENT_SEXES, type PatientSexValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PrivacyNoticeCapture } from '#components/client/patients/privacy-notice-capture';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { patientManagementControllerRegisterNewbornV1 } from '#lib/api/generated/patient-management/patient-management';
import type { CreatePatientDtoPrivacyNotice } from '#lib/api/generated/model/createPatientDtoPrivacyNotice';
import type { RegisterNewbornDto } from '#lib/api/generated/model/registerNewbornDto';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

type RegisterNewbornDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mother: {
    id: string;
    fullName: string;
    /** Shown read-only, so the bidan can see what the baby inherits. */
    addressSummary?: string;
    phoneNumber?: string;
  };
};

/**
 * "Daftarkan bayi" (P24-T10, FR-NB-01).
 *
 * The form asks only for what nobody else knows — the sex, and optionally the
 * date and place of birth. Everything else the API takes from the mother: her
 * name makes the baby's, her address and wilayah codes are the baby's, and the
 * next free birth order is counted for her. Those are shown here read-only
 * rather than as empty fields, because a retyped address is how two records of
 * one household drift apart.
 *
 * The privacy notice is the one thing that cannot be inherited: the baby is a
 * new data subject, and her mother acknowledges it for her.
 */
export function RegisterNewbornDialog({ open, onOpenChange, mother }: RegisterNewbornDialogProps) {
  const t = useTranslations('clinical.patients.newborn');
  const queryClient = useQueryClient();
  const [sex, setSex] = useState<PatientSexValue | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [placeOfBirth, setPlaceOfBirth] = useState<string>('');
  const [privacyNotice, setPrivacyNotice] = useState<CreatePatientDtoPrivacyNotice | undefined>(
    undefined,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const registerMutation = useMutation({
    mutationFn: (payload: RegisterNewbornDto) =>
      patientManagementControllerRegisterNewbornV1(mother.id, payload),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    if (sex === '') {
      setActionError(t('sexRequired'));
      return;
    }
    if (!privacyNotice) {
      setActionError(t('privacyNoticeRequired'));
      return;
    }

    try {
      await registerMutation.mutateAsync({
        sex,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(placeOfBirth.trim() ? { placeOfBirth: placeOfBirth.trim() } : {}),
        privacyNotice: {
          ...privacyNotice,
          // A newborn acknowledges nothing herself; her mother does it for
          // her, which the API refuses to take any other way.
          subjectType: 'REPRESENTATIVE',
          representativeName: privacyNotice.representativeName ?? mother.fullName,
          representativeRelation: privacyNotice.representativeRelation ?? 'Ibu',
        },
      });
      toast.success(t('registered'));
      await invalidatePatientQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { mother: mother.fullName })}</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <InlineNotice tone="info">
            {t('prefillNotice', {
              name: `Bayi Ny. ${mother.fullName}`,
              address: mother.addressSummary ?? t('motherAddressUnknown'),
            })}
          </InlineNotice>

          <div className="space-y-2">
            <FormLabel htmlFor="newborn-sex" required>
              {t('sex')}
            </FormLabel>
            <Select value={sex} onValueChange={(value) => setSex(value as PatientSexValue)}>
              <SelectTrigger id="newborn-sex" aria-label={t('sex')}>
                <SelectValue placeholder={t('sexPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {PATIENT_SEXES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`sexes.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="newborn-date-of-birth">{t('dateOfBirth')}</FormLabel>
            <DatePicker
              id="newborn-date-of-birth"
              value={dateOfBirth}
              onValueChange={setDateOfBirth}
            />
            <p className="text-xs text-slate-500">{t('dateOfBirthHint')}</p>
          </div>

          <div className="space-y-2">
            <FormLabel htmlFor="newborn-place-of-birth">{t('placeOfBirth')}</FormLabel>
            <Input
              id="newborn-place-of-birth"
              value={placeOfBirth}
              onChange={(event) => setPlaceOfBirth(event.target.value)}
            />
          </div>

          <PrivacyNoticeCapture
            isEnabled={open}
            isPatientOwnVariant={false}
            value={privacyNotice}
            onChange={setPrivacyNotice}
          />

          {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? t('saving') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
