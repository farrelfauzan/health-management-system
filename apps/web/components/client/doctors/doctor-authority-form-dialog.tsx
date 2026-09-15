'use client';

import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
  DOCTOR_AUTHORITY_GRANT_KINDS,
  DOCTOR_AUTHORITY_KINDS,
  DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE,
  type DoctorAuthority,
  type DoctorAuthorityGrantKindValue,
  type DoctorAuthorityKindValue,
} from '@hms/shared-types';
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
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  doctorAuthorityControllerCreateAuthorityV1,
  doctorAuthorityControllerUpdateAuthorityV1,
  getDoctorAuthorityControllerListAuthoritiesV1QueryKey,
} from '#lib/api/generated/doctor-authorities/doctor-authorities';
import { notifyApiError } from '#lib/api/notify-api-error';
import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { parseApiSuccess } from '#lib/api/response';
import { isDoctorAuthorityGrantDocumentMimeType } from '#lib/doctors/is-doctor-authority-grant-document-mime-type';
import { uploadDoctorAuthorityGrantDocument } from '#lib/doctors/upload-doctor-authority-grant-document';

const FIELD_ID_PREFIX = 'doctor-authority';

type DoctorAuthorityFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  /** Absent to grant a new authority; present to edit its evidence and dates. */
  authority?: DoctorAuthority;
};

type SubmitStage = 'idle' | 'uploading' | 'saving';

/**
 * Grants or edits one midwife authority (P25-T02, D-036). Every grant names
 * the evidence it rests on (a dinas penetapan, a government penugasan, or a
 * competence on the STR) and always carries a training certificate and an end
 * date. A chosen document is sent through the presigned URL first, and only its
 * storage key reaches the save; the API reads the object back before recording
 * it. The kind is fixed once granted, so editing shows it read-only.
 */
export function DoctorAuthorityFormDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  authority,
}: DoctorAuthorityFormDialogProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const isEditMode = authority !== undefined;
  const [kind, setKind] = useState<string>(authority?.kind ?? '');
  const [grantKind, setGrantKind] = useState<string>(authority?.grantKind ?? '');
  const [grantReference, setGrantReference] = useState<string>(authority?.grantReference ?? '');
  const [grantIssuedAt, setGrantIssuedAt] = useState<string>(authority?.grantIssuedAt ?? '');
  const [trainingCertificateNumber, setTrainingCertificateNumber] = useState<string>(
    authority?.trainingCertificateNumber ?? '',
  );
  const [validFrom, setValidFrom] = useState<string>(authority?.validFrom ?? '');
  const [validUntil, setValidUntil] = useState<string>(authority?.validUntil ?? '');
  const [grantDocumentFile, setGrantDocumentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stage, setStage] = useState<SubmitStage>('idle');

  function resolveValidationError(): string | null {
    const requiredChecks = [
      [!isEditMode && kind === '', 'kindRequired'],
      [grantKind === '', 'grantKindRequired'],
      [grantReference.trim() === '', 'grantReferenceRequired'],
      [grantIssuedAt === '', 'grantIssuedAtRequired'],
      [trainingCertificateNumber.trim() === '', 'trainingCertificateNumberRequired'],
      [validFrom === '', 'validFromRequired'],
      [validUntil === '', 'validUntilRequired'],
    ] as const;
    const missingField = requiredChecks.find(([isMissing]) => isMissing);
    if (missingField) {
      return t(`doctors.authorities.form.${missingField[1]}`);
    }
    return validUntil < validFrom ? t('doctors.authorities.form.validityOrder') : null;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    if (file && !isDoctorAuthorityGrantDocumentMimeType(file.type)) {
      setFormError(t('doctors.authorities.form.grantDocumentFileType'));
      setGrantDocumentFile(null);
      return;
    }
    if (file && file.size > DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES) {
      setFormError(t('doctors.authorities.form.grantDocumentFileTooLarge'));
      setGrantDocumentFile(null);
      return;
    }
    setFormError(null);
    setGrantDocumentFile(file);
  }

  async function uploadChosenFile(): Promise<string | undefined> {
    if (!grantDocumentFile || !isDoctorAuthorityGrantDocumentMimeType(grantDocumentFile.type)) {
      return undefined;
    }
    setStage('uploading');
    return uploadDoctorAuthorityGrantDocument({
      doctorId,
      file: grantDocumentFile,
      mimeType: grantDocumentFile.type,
    });
  }

  async function saveAuthority(grantDocumentStorageKey: string | undefined): Promise<void> {
    setStage('saving');
    const evidence = {
      grantKind: grantKind as DoctorAuthorityGrantKindValue,
      grantReference: grantReference.trim(),
      grantIssuedAt,
      trainingCertificateNumber: trainingCertificateNumber.trim(),
      validFrom,
      validUntil,
      ...(grantDocumentStorageKey ? { grantDocumentStorageKey } : {}),
    };
    const response = authority
      ? await doctorAuthorityControllerUpdateAuthorityV1(doctorId, authority.id, evidence)
      : await doctorAuthorityControllerCreateAuthorityV1(doctorId, {
          kind: kind as DoctorAuthorityKindValue,
          ...evidence,
        });
    parseApiSuccess<DoctorAuthority>(response, t('doctors.authorities.form.error'));
  }

  function resolveSaveErrorMessage(error: unknown): string {
    const code = resolveApiErrorCode(error);
    if (code === DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE) {
      return t('doctors.authorities.form.alreadyActive');
    }
    if (code === DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE) {
      return t('doctors.authorities.form.requiresMidwife');
    }
    return notifyApiError(error, t('doctors.authorities.form.error'));
  }

  async function handleSubmit(): Promise<void> {
    const validationError = resolveValidationError();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      await saveAuthority(await uploadChosenFile());
      await queryClient.invalidateQueries({
        queryKey: getDoctorAuthorityControllerListAuthoritiesV1QueryKey(doctorId),
      });
      onOpenChange(false);
    } catch (error) {
      setFormError(resolveSaveErrorMessage(error));
    } finally {
      setStage('idle');
    }
  }

  const isBusy = stage !== 'idle';
  const grantReferenceLabel =
    grantKind === ''
      ? t('doctors.authorities.form.grantReference')
      : t(
          `doctors.authorities.form.grantReferenceByKind.${grantKind as DoctorAuthorityGrantKindValue}`,
        );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isEditMode
              ? t('doctors.authorities.form.editTitle')
              : t('doctors.authorities.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('doctors.authorities.form.description', { name: doctorName })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={`${FIELD_ID_PREFIX}-kind`}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('doctors.authorities.form.kind')}
            </FormLabel>
            <Select value={kind} disabled={isEditMode || isBusy} onValueChange={setKind}>
              <SelectTrigger id={`${FIELD_ID_PREFIX}-kind`} className="w-full">
                <SelectValue placeholder={t('doctors.authorities.form.kindPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {DOCTOR_AUTHORITY_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`doctors.authorities.kind.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditMode ? (
              <FieldDescription id={`${FIELD_ID_PREFIX}-kind-locked`}>
                {t('doctors.authorities.form.kindLocked')}
              </FieldDescription>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={`${FIELD_ID_PREFIX}-grant-kind`}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('doctors.authorities.form.grantKind')}
            </FormLabel>
            <Select value={grantKind} disabled={isBusy} onValueChange={setGrantKind}>
              <SelectTrigger id={`${FIELD_ID_PREFIX}-grant-kind`} className="w-full">
                <SelectValue placeholder={t('doctors.authorities.form.grantKindPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {DOCTOR_AUTHORITY_GRANT_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`doctors.authorities.grantKind.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-grant-reference`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {grantReferenceLabel}
              </FormLabel>
              <Input
                id={`${FIELD_ID_PREFIX}-grant-reference`}
                value={grantReference}
                disabled={isBusy}
                onChange={(event) => setGrantReference(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-grant-issued-at`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('doctors.authorities.form.grantIssuedAt')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-grant-issued-at`}
                value={grantIssuedAt}
                disabled={isBusy}
                onValueChange={setGrantIssuedAt}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-valid-from`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('doctors.authorities.form.validFrom')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-valid-from`}
                value={validFrom}
                disabled={isBusy}
                onValueChange={setValidFrom}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-valid-until`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('doctors.authorities.form.validUntil')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-valid-until`}
                value={validUntil}
                disabled={isBusy}
                minValue={validFrom || undefined}
                aria-describedby={`${FIELD_ID_PREFIX}-valid-until-hint`}
                onValueChange={setValidUntil}
              />
              <FieldDescription id={`${FIELD_ID_PREFIX}-valid-until-hint`}>
                {t('doctors.authorities.form.validUntilHint')}
              </FieldDescription>
            </div>
          </div>
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={`${FIELD_ID_PREFIX}-training`}
              className="font-heading text-xs text-slate-600"
              required
            >
              {t('doctors.authorities.form.trainingCertificateNumber')}
            </FormLabel>
            <Input
              id={`${FIELD_ID_PREFIX}-training`}
              value={trainingCertificateNumber}
              disabled={isBusy}
              onChange={(event) => setTrainingCertificateNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FormLabel
              htmlFor={`${FIELD_ID_PREFIX}-grant-document-file`}
              className="font-heading text-xs text-slate-600"
            >
              {t('doctors.authorities.form.grantDocumentFile')}
            </FormLabel>
            <Input
              id={`${FIELD_ID_PREFIX}-grant-document-file`}
              type="file"
              accept={DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES.join(',')}
              disabled={isBusy}
              onChange={handleFileChange}
            />
            {authority?.hasGrantDocument ? (
              <FieldDescription id={`${FIELD_ID_PREFIX}-grant-document-file-keep`}>
                {t('doctors.authorities.form.grantDocumentFileKeep')}
              </FieldDescription>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isBusy}
              className="bg-primary-container hover:bg-primary"
            >
              {stage === 'uploading'
                ? t('doctors.authorities.form.uploading')
                : stage === 'saving'
                  ? t('doctors.authorities.form.submitting')
                  : t('doctors.authorities.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
