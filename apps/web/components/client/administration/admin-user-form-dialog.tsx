'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAdminUserSchema,
  type AdminUser,
  type CreateAdminUserInput,
  type UpdateAdminUserInput,
} from '@hms/shared-types';
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
import {
  adminManagementControllerCreateAdminUserV1,
  adminManagementControllerUpdateAdminUserV1,
} from '#lib/api/generated/admin-management/admin-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAdminUserQueries } from '#lib/admin-users/invalidate-admin-user-queries';
import { useRolesList } from '#lib/rbac/use-roles-list';

const MIN_PASSWORD_LENGTH = 8;

type AdminUserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: AdminUser | null;
};

export function AdminUserFormDialog({ open, onOpenChange, user }: AdminUserFormDialogProps) {
  const t = useTranslations('operations');
  const isEditMode = Boolean(user);
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const rolesQuery = useRolesList();
  const createMutation = useMutation({
    mutationFn: (input: CreateAdminUserInput) => adminManagementControllerCreateAdminUserV1(input),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminUserInput }) =>
      adminManagementControllerUpdateAdminUserV1(id, input),
  });
  const form = useForm({
    defaultValues: {
      email: user?.email ?? '',
      password: '',
      roleCodes: user?.roles.map((role) => role.code) ?? ([] as string[]),
      isActive: user?.isActive ?? true,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (isEditMode && user) {
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
        } else {
          const response = await createMutation.mutateAsync({
            email: value.email,
            password: value.password,
            roleCodes: value.roleCodes,
            isActive: value.isActive,
          });
          parseApiSuccess<AdminUser>(response, t('administration.saveError'));
        }
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
          <DialogTitle className="font-heading">
            {isEditMode ? t('administration.editUser') : t('administration.addUser')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the user account, roles, and status.'
              : 'Create a new system user with at least one role.'}
          </DialogDescription>
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

          <form.Field name="email" validators={{ onSubmit: createAdminUserSchema.shape.email }}>
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
                (isEditMode && value.length === 0) || value.length >= MIN_PASSWORD_LENGTH
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
                  {isEditMode ? t('administration.newPassword') : t('administration.password')}
                </label>
                <Input
                  id={field.name}
                  type="password"
                  value={field.state.value}
                  placeholder={
                    isEditMode ? 'Leave blank to keep current password' : 'Minimum 8 characters'
                  }
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
                  {isSubmitting
                    ? t('administration.saving')
                    : isEditMode
                      ? t('administration.saveChanges')
                      : t('administration.createUser')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
