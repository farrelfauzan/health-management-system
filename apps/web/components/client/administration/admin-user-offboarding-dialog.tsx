'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminUser, UserOffboardingPreview } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import {
  userOffboardingControllerOffboardUserV1,
  userOffboardingControllerReonboardUserV1,
} from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import { useUserOffboardingPreview } from '#lib/admin-users/use-user-offboarding-preview';

type AdminUserOffboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
};

/**
 * The super admin's confirm step for offboarding (P16-T41, FR-E3-31), and
 * its reversal.
 *
 * The preview is the substance of this dialog, not decoration: how many of
 * the person's documents survive because they are shared, how many are
 * deleted, and on which day. A super admin confirming "3 documents will be
 * deleted on 4 October" has made a decision; one confirming "offboard this
 * user?" has clicked a button. The copy also says what happens *now* — every
 * session ends, and from their next request the person can reach only their
 * own documents — because that is the part that surprises people.
 *
 * Re-onboarding uses the same dialog in reverse: the same counts, and the
 * statement that nothing will be deleted.
 */
export function AdminUserOffboardingDialog({
  open,
  onOpenChange,
  user,
}: AdminUserOffboardingDialogProps) {
  const t = useTranslations('operations.administration.offboarding');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const isReonboarding = user.offboardedAt !== undefined;
  const previewQuery = useUserOffboardingPreview({
    userId: user.id,
    isEnabled: open,
    fallbackError: t('previewError'),
  });
  const preview = previewQuery.data ?? null;
  const mutation = useMutation({
    mutationFn: (id: string) =>
      isReonboarding
        ? userOffboardingControllerReonboardUserV1(id)
        : userOffboardingControllerOffboardUserV1(id),
  });

  async function handleConfirm(): Promise<void> {
    setFormError(null);
    try {
      const response = await mutation.mutateAsync(user.id);
      parseApiSuccess<UserOffboardingPreview>(response, t('error'));
      await invalidateAdminUserQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setFormError(notifyApiError(error, t('error')));
    }
  }

  const deletionDate = preview
    ? format.dateTime(new Date(`${preview.deletionDate}T00:00:00.000Z`), {
        dateStyle: 'long',
        timeZone: 'UTC',
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReonboarding ? t('reonboardTitle') : t('offboardTitle', { email: user.email })}
          </DialogTitle>
          <DialogDescription>
            {isReonboarding ? t('reonboardDescription') : t('offboardDescription')}
          </DialogDescription>
        </DialogHeader>
        {previewQuery.isPending ? (
          <p className="text-sm text-slate-500">{t('previewLoading')}</p>
        ) : preview === null ? (
          <p className="text-sm text-red-700">{t('previewError')}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <dt className="font-medium text-slate-900">{t('preview.deletionDate')}</dt>
            <dd className="text-slate-700">{deletionDate}</dd>
            <dt className="font-medium text-slate-900">{t('preview.unshared')}</dt>
            <dd className="text-slate-700">
              {t('preview.unsharedValue', { count: preview.unsharedDocumentCount })}
            </dd>
            <dt className="font-medium text-slate-900">{t('preview.shared')}</dt>
            <dd className="text-slate-700">
              {t('preview.sharedValue', { count: preview.sharedDocumentCount })}
            </dd>
          </dl>
        )}
        {!isReonboarding ? (
          <p className="text-sm text-slate-700">{t('offboardConsequences')}</p>
        ) : (
          <p className="text-sm text-slate-700">{t('reonboardConsequences')}</p>
        )}
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant={isReonboarding ? 'default' : 'destructive'}
            disabled={mutation.isPending || preview === null}
            onClick={() => void handleConfirm()}
          >
            {mutation.isPending
              ? t('pending')
              : isReonboarding
                ? t('reonboardConfirm')
                : t('offboardConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
