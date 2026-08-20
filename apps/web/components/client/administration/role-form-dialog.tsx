'use client';

import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRoleSchema,
  type CreateRoleInput,
  type RoleListItem,
  type RoleSummary,
  type UpdateRoleInput,
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
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldError } from '#components/client/shared/field-error';
import {
  rbacControllerCreateRoleV1,
  rbacControllerUpdateRoleV1,
} from '#lib/api/generated/rbac/rbac';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateRoleQueries } from '#lib/rbac/invalidate-role-queries';

type RoleFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleListItem | null;
};

export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const t = useTranslations('operations.administration.roles');
  const isEditMode = Boolean(role);
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (input: CreateRoleInput) => rbacControllerCreateRoleV1(input),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) =>
      rbacControllerUpdateRoleV1(id, input),
  });
  const form = useForm({
    defaultValues: {
      code: role?.code ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const description = value.description.trim();
      try {
        if (isEditMode && role) {
          const response = await updateMutation.mutateAsync({
            id: role.id,
            input: {
              name: value.name,
              description: description.length > 0 ? description : null,
            },
          });
          parseApiSuccess<RoleSummary>(response, t('saveError'));
        } else {
          const response = await createMutation.mutateAsync({
            code: value.code,
            name: value.name,
            ...(description.length > 0 ? { description } : {}),
          });
          parseApiSuccess<RoleSummary>(response, t('saveError'));
        }
        await invalidateRoleQueries(queryClient);
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, t('saveError')));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEditMode ? t('editRole') : t('addRole')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? t('editRoleDescription') : t('addRoleDescription')}
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

          {isEditMode ? null : (
            <form.Field name="code" validators={{ onSubmit: createRoleSchema.shape.code }}>
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor={field.name}
                    className="block font-heading text-xs font-medium text-slate-600"
                  >
                    {t('codeLabel')}
                  </label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    placeholder="FRONT_DESK_LEAD"
                    onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <p className="text-xs text-slate-500">{t('codeHint')}</p>
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          )}

          <form.Field name="name" validators={{ onSubmit: createRoleSchema.shape.name }}>
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  {t('nameLabel')}
                </label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  placeholder={t('namePlaceholder')}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <div className="space-y-1.5">
                <label
                  htmlFor={field.name}
                  className="block font-heading text-xs font-medium text-slate-600"
                >
                  {t('descriptionLabel')}
                </label>
                <Textarea
                  id={field.name}
                  value={field.state.value}
                  rows={3}
                  placeholder={t('descriptionPlaceholder')}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary-container hover:bg-primary"
                >
                  {isSubmitting ? t('saving') : isEditMode ? t('saveChanges') : t('createRole')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
