'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTypeView } from '@hms/shared-types';
import { Button, Card, CardContent, Checkbox, Icon, Label, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DeleteDocumentTypeDialog } from '#components/client/document-types/delete-document-type-dialog';
import { DocumentTypeApproversDialog } from '#components/client/document-types/document-type-approvers-dialog';
import { DocumentTypeFormDialog } from '#components/client/document-types/document-type-form-dialog';
import { DocumentTypesTable } from '#components/client/document-types/document-types-table';
import { documentTypeControllerUpdateTypeV1 } from '#lib/api/generated/document-types/document-types';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDocumentTypeQueries } from '#lib/document-types/invalidate-document-type-queries';
import { useDocumentTypes } from '#lib/document-types/use-document-types';

type TypeDialogState = {
  mode: 'create' | 'edit' | 'approvers' | 'delete' | null;
  type: DocumentTypeView | null;
};

const CLOSED_DIALOG: TypeDialogState = { mode: null, type: null };

/**
 * Documents → Types (`P16-T39`, FR-E5-31/36/39): the sortable list with
 * usage counts and the active toggle, and the dialogs that create, edit,
 * name default approvers for, and delete a type. `canWrite` decides only
 * whether the controls render; the API refuses every write regardless.
 */
export function DocumentTypesPanel() {
  const t = useTranslations('operations.documents.types');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'DocumentType');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [dialogState, setDialogState] = useState<TypeDialogState>(CLOSED_DIALOG);
  const typesQuery = useDocumentTypes(showInactive);

  const toggleActiveMutation = useMutation({
    mutationFn: async (type: DocumentTypeView) =>
      parseApiSuccess<DocumentTypeView>(
        await documentTypeControllerUpdateTypeV1(type.id, { isActive: !type.isActive }),
        t('actions.toggleError'),
      ),
    onSuccess: async (envelope) => {
      await invalidateDocumentTypeQueries(queryClient);
      toast.success(envelope.data.isActive ? t('actions.activated') : t('actions.deactivated'));
    },
    onError: (err: unknown) => notifyApiError(err, t('actions.toggleError')),
  });

  function closeDialog(): void {
    setDialogState(CLOSED_DIALOG);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {canWrite ? t('description') : t('readOnlyNotice')}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="document-types-show-inactive"
              checked={showInactive}
              onCheckedChange={(value) => setShowInactive(value === true)}
            />
            <Label htmlFor="document-types-show-inactive" className="text-sm">
              {t('showInactive')}
            </Label>
          </div>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setDialogState({ mode: 'create', type: null })}
            >
              <Icon name="add" size={18} />
              {t('new')}
            </Button>
          ) : null}
        </div>
      </div>
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <DocumentTypesTable
            types={typesQuery.types}
            isPending={typesQuery.isPending}
            isError={typesQuery.isError}
            canWrite={canWrite}
            isMutating={toggleActiveMutation.isPending}
            onEdit={(type) => setDialogState({ mode: 'edit', type })}
            onApprovers={(type) => setDialogState({ mode: 'approvers', type })}
            onToggleActive={(type) => toggleActiveMutation.mutate(type)}
            onDelete={(type) => setDialogState({ mode: 'delete', type })}
          />
        </CardContent>
      </Card>
      {dialogState.mode === 'create' || dialogState.mode === 'edit' ? (
        <DocumentTypeFormDialog
          open
          type={dialogState.type}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        />
      ) : null}
      {dialogState.mode === 'approvers' && dialogState.type ? (
        <DocumentTypeApproversDialog
          open
          type={dialogState.type}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
        />
      ) : null}
      {dialogState.mode === 'delete' && dialogState.type ? (
        <DeleteDocumentTypeDialog
          open
          type={dialogState.type}
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          onDeactivateInstead={(type) => {
            closeDialog();
            toggleActiveMutation.mutate(type);
          }}
        />
      ) : null}
    </div>
  );
}
