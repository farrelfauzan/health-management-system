'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUserEmailSchema, type AdminUser, type UpdateAdminUserInput } from '@hms/shared-types';
import {
  Button,
  Checkbox,
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
import { adminManagementControllerUpdateAdminUserV1 } from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import { useRolesList } from '#lib/rbac/use-roles-list';

const MIN_PASSWORD_LENGTH = 8;

type AdminUserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
};

/**
 * Editing an existing staff account. Creating one lives in
 * `AdminUserInviteDialog` (IMP-23) — this dialog no longer has a create mode,
 * because the only way to make an account is now to invite its owner and let
 * them choose their own password.
 *
 * The optional password field survives here on purpose: it is an
 * administrator resetting the credential of someone who has lost it, which is
 * a different act from handing out a first password, and the alternative for a
 * locked-out nurse is no route back in at all.
 */
export function AdminUserFormDialog({ open, onOpenChange, user }: AdminUserFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const rolesQuery = useRolesList();
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminUserInput }) =>
      adminManagementControllerUpdateAdminUserV1(id, input),
  });
  const form = useForm({
    defaultValues: {
      email: user.email,
      password: '',
      roleCodes: user.roles.map((role) => role.code),
      isActive: user.isActive,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const response = await updateMutation.mutateAsync({
          id: user.id,
          input: {
            email: value.email,
            roleCodes: value.roleCodes,
            isActive: value.isActive,
            ...(value.password.length > 0 ? { password: value.password } : {}),
          },
        });
        parseApiSuccess<AdminUser>(response, t('administration.saveError'));
        await invalidateAdminUserQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, t('administration.saveError')));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('administration.editUser')}</DialogTitle>
          <DialogDescription>{t('administration.editUserDescription')}</DialogDescription>
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

          <form.Field name="email" validators={{ onSubmit: adminUserEmailSchema }}>
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  Email
                </label>
                <Input
                  id={field.name}
                  type="email"
                  value={field.state.value}
                  placeholder="admin@salingjaga.com"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{
              onSubmit: ({ value }) =>
                value.length === 0 || value.length >= MIN_PASSWORD_LENGTH
                  ? undefined
                  : t('administration.passwordMinimum', { count: MIN_PASSWORD_LENGTH }),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  {t('administration.newPassword')}
                </label>
                <Input
                  id={field.name}
                  type="password"
                  value={field.state.value}
                  placeholder={t('administration.passwordUnchangedPlaceholder')}
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
              onSubmit: ({ value }) =>
                value.length > 0 ? undefined : t('administration.selectRole'),
            }}
          >
            {(field) => (
              <div className="space-y-1.5">
                <span className="block font-heading text-xs font-medium text-slate-600">
                  {t('administration.role')}
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

          <form.Field name="isActive">
            {(field) => (
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <span className="text-sm text-slate-700">{t('common.active')}</span>
              </label>
            )}
          </form.Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('administration.saving') : t('administration.saveChanges')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
