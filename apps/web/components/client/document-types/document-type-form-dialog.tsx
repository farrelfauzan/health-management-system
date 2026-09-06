'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_CONTENT_MODES,
  MAX_DOCUMENT_TYPE_DESCRIPTION_LENGTH,
  MAX_DOCUMENT_TYPE_NAME_LENGTH,
  type CreateDocumentTypeInput,
  type DocumentContentModeValue,
  type DocumentTypeView,
  type UpdateDocumentTypeInput,
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
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  DocumentTypeApprovalFields,
  type DocumentTypeApprovalValues,
} from '#components/client/document-types/document-type-approval-fields';
import {
  documentTypeControllerCreateTypeV1,
  documentTypeControllerUpdateTypeV1,
} from '#lib/api/generated/document-types/document-types';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentTypeQueries } from '#lib/document-types/invalidate-document-type-queries';

type DocumentTypeFormDialogProps = {
  open: boolean;
  /** The type being edited, or null when creating. */
  type: DocumentTypeView | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Create or edit a type (FR-E5-31/33/35).
 *
 * **There is no behaviour field on this form**, in either mode. A clinic
 * type is always generic — the API sets it and refuses a payload that names
 * it — and a system type's behaviour is shown read-only with its code, under
 * a note saying why. That absence is the safety boundary of dynamic types
 * (§7.5.2.1), so it is deliberate rather than an omission.
 */
export function DocumentTypeFormDialog({ open, type, onOpenChange }: DocumentTypeFormDialogProps) {
  const t = useTranslations('operations.documents.types');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEditing = type !== null;
  const [name, setName] = useState<string>(type?.name ?? '');
  const [description, setDescription] = useState<string>(type?.description ?? '');
  const [requiresPatient, setRequiresPatient] = useState<boolean>(type?.requiresPatient ?? false);
  const [requiresDoctor, setRequiresDoctor] = useState<boolean>(type?.requiresDoctor ?? false);
  const [contentMode, setContentMode] = useState<DocumentContentModeValue>(
    type?.contentMode ?? 'EITHER',
  );
  const [sortOrder, setSortOrder] = useState<number>(type?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(type?.isActive ?? true);
  const [approval, setApproval] = useState<DocumentTypeApprovalValues>({
    isApprovalRequired: type?.isApprovalRequired ?? false,
    allowSelfApproval: type?.allowSelfApproval ?? false,
    requiredApprovals: type?.requiredApprovals ?? 1,
  });
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateDocumentTypeInput | UpdateDocumentTypeInput) =>
      parseApiSuccess<DocumentTypeView>(
        isEditing
          ? await documentTypeControllerUpdateTypeV1(type.id, payload as UpdateDocumentTypeInput)
          : await documentTypeControllerCreateTypeV1(payload as CreateDocumentTypeInput),
        t('form.error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentTypeQueries(queryClient);
      toast.success(isEditing ? t('form.updated') : t('form.created'));
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('form.error'))),
  });

  function buildPayload(): CreateDocumentTypeInput | UpdateDocumentTypeInput {
    const trimmedDescription = description.trim();
    return {
      name: name.trim(),
      description: isEditing
        ? trimmedDescription === ''
          ? null
          : trimmedDescription
        : trimmedDescription === ''
          ? undefined
          : trimmedDescription,
      isApprovalRequired: approval.isApprovalRequired,
      allowSelfApproval: approval.isApprovalRequired && approval.allowSelfApproval,
      requiredApprovals: approval.requiredApprovals,
      requiresPatient,
      requiresDoctor,
      contentMode,
      isActive,
      sortOrder,
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    saveMutation.mutate(buildPayload());
  }

  const isSubmitDisabled = saveMutation.isPending || name.trim() === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEditing ? t('form.editTitle') : t('form.createTitle')}</DialogTitle>
            <DialogDescription>
              {isEditing ? t('form.editDescription') : t('form.createDescription')}
            </DialogDescription>
          </DialogHeader>
          {type?.isSystem ? (
            <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              <span>{t('form.systemNote')}</span>
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="document-type-name">{t('form.name')}</Label>
            <Input
              id="document-type-name"
              value={name}
              placeholder={t('form.namePlaceholder')}
              maxLength={MAX_DOCUMENT_TYPE_NAME_LENGTH}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document-type-description">{t('form.description')}</Label>
            <Input
              id="document-type-description"
              value={description}
              placeholder={t('form.descriptionPlaceholder')}
              maxLength={MAX_DOCUMENT_TYPE_DESCRIPTION_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">{t('form.code')}</p>
                <p className="font-mono text-sm text-slate-900">{type.code}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">{t('form.behavior')}</p>
                <p className="text-sm text-slate-900">{t(`behaviors.${type.behavior}`)}</p>
              </div>
              <p className="col-span-2 text-xs text-slate-500">{t('form.codeHint')}</p>
            </div>
          ) : null}
          <DocumentTypeApprovalFields
            values={approval}
            disabled={saveMutation.isPending}
            onChange={setApproval}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">{t('form.parties')}</legend>
            <div className="flex items-center gap-2">
              <Checkbox
                id="document-type-requires-patient"
                checked={requiresPatient}
                onCheckedChange={(value) => setRequiresPatient(value === true)}
              />
              <Label htmlFor="document-type-requires-patient" className="text-sm font-normal">
                {t('form.requiresPatient')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="document-type-requires-doctor"
                checked={requiresDoctor}
                onCheckedChange={(value) => setRequiresDoctor(value === true)}
              />
              <Label htmlFor="document-type-requires-doctor" className="text-sm font-normal">
                {t('form.requiresDoctor')}
              </Label>
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="document-type-content-mode">{t('form.contentMode')}</Label>
              <Select
                value={contentMode}
                onValueChange={(value) => setContentMode(value as DocumentContentModeValue)}
              >
                <SelectTrigger id="document-type-content-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CONTENT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`contentModes.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document-type-sort-order">{t('form.sortOrder')}</Label>
              <Input
                id="document-type-sort-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="document-type-is-active"
              checked={isActive}
              onCheckedChange={(value) => setIsActive(value === true)}
            />
            <Label htmlFor="document-type-is-active" className="text-sm font-normal">
              {t('form.isActive')}
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {common('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {saveMutation.isPending
                ? common('saving')
                : isEditing
                  ? t('form.submitEdit')
                  : t('form.submitCreate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
