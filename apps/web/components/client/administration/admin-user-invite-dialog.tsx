'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createUserInvitationSchema,
  type CreateUserInvitationInput,
  type UserInvitationView,
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminUserRolePicker } from '#components/client/administration/admin-user-role-picker';
import { FieldError } from '#components/client/shared/field-error';
import { userInvitationAdminControllerCreateInvitationV1 } from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import { useRolesList } from '#lib/rbac/use-roles-list';

type AdminUserInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Creating a staff account (IMP-23). There is deliberately no password field:
 * the invitee sets their own from the emailed link, so the administrator
 * filling this in never knows it and never has to transmit it out of band.
 */
export function AdminUserInviteDialog({ open, onOpenChange }: AdminUserInviteDialogProps) {
  const t = useTranslations('operations.administration');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const rolesQuery = useRolesList();
  const inviteMutation = useMutation({
    mutationFn: (input: CreateUserInvitationInput) =>
      userInvitationAdminControllerCreateInvitationV1(input),
  });
  const form = useForm({
    defaultValues: {
      email: '',
      roleCodes: [] as string[],
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const response = await inviteMutation.mutateAsync({
          email: value.email,
          roleCodes: value.roleCodes,
        });
        parseApiSuccess<UserInvitationView>(response, t('invitations.sendError'));
        await invalidateAdminUserQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, t('invitations.sendError')));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('invitations.inviteUser')}</DialogTitle>
          <DialogDescription>{t('invitations.inviteDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {formError}
            </p>
          ) : null}

          <form.Field
            name="email"
            validators={{ onSubmit: createUserInvitationSchema.shape.email }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  {t('invitations.emailLabel')}
                </label>
                <Input
                  id={field.name}
                  type="email"
                  value={field.state.value}
                  placeholder="perawat@salingjaga.com"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field
            name="roleCodes"
            validators={{
              onSubmit: ({ value }) => (value.length > 0 ? undefined : t('selectRole')),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <span className="block font-heading text-xs font-medium text-slate-600">
                  {t('role')}
                </span>
                <AdminUserRolePicker
                  roles={rolesQuery.roles}
                  selectedRoleCodes={field.state.value}
                  isLoading={rolesQuery.isPending}
                  hasError={field.state.meta.errors.length > 0}
                  onToggleRole={(roleCode) =>
                    field.handleChange(
                      field.state.value.includes(roleCode)
                        ? field.state.value.filter((code) => code !== roleCode)
                        : [...field.state.value, roleCode],
                    )
                  }
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {t('invitations.passwordNotice')}
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('invitations.cancel')}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('invitations.sending') : t('invitations.sendInvitation')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
