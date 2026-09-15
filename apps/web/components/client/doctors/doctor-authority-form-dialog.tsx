'use client';

import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE,
  DOCTOR_AUTHORITY_DECREE_MAX_SIZE_BYTES,
  DOCTOR_AUTHORITY_DECREE_MIME_TYPES,
  DOCTOR_AUTHORITY_KINDS,
  DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE,
  type DoctorAuthority,
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
import { isDoctorAuthorityDecreeMimeType } from '#lib/doctors/is-doctor-authority-decree-mime-type';
import { uploadDoctorAuthorityDecree } from '#lib/doctors/upload-doctor-authority-decree';

const FIELD_ID_PREFIX = 'doctor-authority';

type DoctorAuthorityFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  /** Absent to grant a new authority; present to edit its numbers, dates and letter. */
  authority?: DoctorAuthority;
};

type SubmitStage = 'idle' | 'uploading' | 'saving';

/**
 * Grants or edits one midwife authority (P25-T02). A chosen letter is sent
 * through the presigned URL first, and only its storage key reaches the save;
 * the API then reads the object back before recording it. The kind is fixed
 * once granted — editing shows it read-only.
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
  const [trainingCertificateNumber, setTrainingCertificateNumber] = useState<string>(
    authority?.trainingCertificateNumber ?? '',
  );
  const [decreeNumber, setDecreeNumber] = useState<string>(authority?.decreeNumber ?? '');
  const [decreeIssuedAt, setDecreeIssuedAt] = useState<string>(authority?.decreeIssuedAt ?? '');
  const [validFrom, setValidFrom] = useState<string>(authority?.validFrom ?? '');
  const [validUntil, setValidUntil] = useState<string>(authority?.validUntil ?? '');
  const [decreeFile, setDecreeFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stage, setStage] = useState<SubmitStage>('idle');

  function resolveValidationError(): string | null {
    if (!isEditMode && kind === '') {
      return t('doctors.authorities.form.kindRequired');
    }
    if (decreeNumber.trim() === '') {
      return t('doctors.authorities.form.decreeNumberRequired');
    }
    if (decreeIssuedAt === '') {
      return t('doctors.authorities.form.decreeIssuedAtRequired');
    }
    if (validFrom === '') {
      return t('doctors.authorities.form.validFromRequired');
    }
    if (validUntil !== '' && validUntil < validFrom) {
      return t('doctors.authorities.form.validityOrder');
    }
    return null;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    if (file && !isDoctorAuthorityDecreeMimeType(file.type)) {
      setFormError(t('doctors.authorities.form.decreeFileType'));
      setDecreeFile(null);
      return;
    }
    if (file && file.size > DOCTOR_AUTHORITY_DECREE_MAX_SIZE_BYTES) {
      setFormError(t('doctors.authorities.form.decreeFileTooLarge'));
      setDecreeFile(null);
      return;
    }
    setFormError(null);
    setDecreeFile(file);
  }

  async function uploadChosenFile(): Promise<string | undefined> {
    if (!decreeFile || !isDoctorAuthorityDecreeMimeType(decreeFile.type)) {
      return undefined;
    }
    setStage('uploading');
    return uploadDoctorAuthorityDecree({ doctorId, file: decreeFile, mimeType: decreeFile.type });
  }

  async function saveAuthority(decreeStorageKey: string | undefined): Promise<void> {
    setStage('saving');
    const response = authority
      ? await doctorAuthorityControllerUpdateAuthorityV1(doctorId, authority.id, {
          trainingCertificateNumber: trainingCertificateNumber.trim() || null,
          decreeNumber: decreeNumber.trim(),
          decreeIssuedAt,
          validFrom,
          validUntil: validUntil === '' ? null : validUntil,
          ...(decreeStorageKey ? { decreeStorageKey } : {}),
        })
      : await doctorAuthorityControllerCreateAuthorityV1(doctorId, {
          kind: kind as DoctorAuthorityKindValue,
          ...(trainingCertificateNumber.trim()
            ? { trainingCertificateNumber: trainingCertificateNumber.trim() }
            : {}),
          decreeNumber: decreeNumber.trim(),
          decreeIssuedAt,
          validFrom,
          ...(validUntil ? { validUntil } : {}),
          ...(decreeStorageKey ? { decreeStorageKey } : {}),
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-decree-number`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('doctors.authorities.form.decreeNumber')}
              </FormLabel>
              <Input
                id={`${FIELD_ID_PREFIX}-decree-number`}
                value={decreeNumber}
                disabled={isBusy}
                placeholder="440/123/2026"
                onChange={(event) => setDecreeNumber(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel
                htmlFor={`${FIELD_ID_PREFIX}-decree-issued-at`}
                className="font-heading text-xs text-slate-600"
                required
              >
                {t('doctors.authorities.form.decreeIssuedAt')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-decree-issued-at`}
                value={decreeIssuedAt}
                disabled={isBusy}
                onValueChange={setDecreeIssuedAt}
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
              htmlFor={`${FIELD_ID_PREFIX}-decree-file`}
              className="font-heading text-xs text-slate-600"
            >
              {t('doctors.authorities.form.decreeFile')}
            </FormLabel>
            <Input
              id={`${FIELD_ID_PREFIX}-decree-file`}
              type="file"
              accept={DOCTOR_AUTHORITY_DECREE_MIME_TYPES.join(',')}
              disabled={isBusy}
              onChange={handleFileChange}
            />
            {authority?.hasDecree ? (
              <FieldDescription id={`${FIELD_ID_PREFIX}-decree-file-keep`}>
                {t('doctors.authorities.form.decreeFileKeep')}
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
