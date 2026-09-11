'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  doctorEmailSchema,
  type DoctorProfile,
  type InviteDoctorAccountInput,
} from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@hms/ui';

import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { doctorManagementControllerInviteDoctorAccountV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';

const EMAIL_INPUT_ID = 'invite-doctor-email';
const EMAIL_DESCRIPTION_ID = 'invite-doctor-email-description';

type DoctorInviteAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
};

/**
 * Sends a sign-in invitation to a doctor who has no account (P20-T01).
 *
 * For doctors created before an email was required, and for those whose
 * invitation lapsed or was withdrawn. An address that already has an account
 * is attached instead of invited — the API decides, exactly as on create — so
 * the copy speaks of "access" rather than promising an email.
 */
export function DoctorInviteAccountDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
}: DoctorInviteAccountDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [email, setEmail] = useState<string>('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inviteMutation = useMutation({
    mutationFn: (input: InviteDoctorAccountInput) =>
      doctorManagementControllerInviteDoctorAccountV1(doctorId, input),
  });

  async function handleInvite(): Promise<void> {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) {
      setInviteError(t('doctors.form.emailRequired'));
      return;
    }
    if (!doctorEmailSchema.safeParse(trimmedEmail).success) {
      setInviteError(t('doctors.form.emailInvalid'));
      return;
    }
    setInviteError(null);
    try {
      const response = await inviteMutation.mutateAsync({ email: trimmedEmail });
      parseApiSuccess<DoctorProfile>(response, t('doctors.inviteAccount.error'));
      await invalidateDoctorQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setInviteError(notifyApiError(error, t('doctors.inviteAccount.error')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('doctors.inviteAccount.title')}</DialogTitle>
          <DialogDescription>
            {t('doctors.inviteAccount.description', { name: doctorName })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleInvite();
          }}
        >
          {inviteError ? <InlineNotice tone="error">{inviteError}</InlineNotice> : null}
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={EMAIL_INPUT_ID}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('doctors.email')}
            </FormLabel>
            <Input
              id={EMAIL_INPUT_ID}
              type="email"
              autoComplete="email"
              value={email}
              placeholder="budi.santoso@clinic.local"
              aria-describedby={EMAIL_DESCRIPTION_ID}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldDescription id={EMAIL_DESCRIPTION_ID}>
              {t('doctors.inviteAccount.emailDescription')}
            </FieldDescription>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="bg-primary-container hover:bg-primary"
            >
              {inviteMutation.isPending
                ? t('doctors.inviteAccount.submitting')
                : t('doctors.sendInvitation')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
