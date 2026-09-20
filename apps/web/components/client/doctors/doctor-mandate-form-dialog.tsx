'use client';

import { useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES,
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
  DOCTOR_MANDATE_INSTRUCTION_REQUIRED_ERROR_CODE,
  DOCTOR_MANDATE_INVALID_PARTIES_ERROR_CODE,
  DOCTOR_MANDATE_KINDS,
  MAX_MANDATE_PROCEDURE_CODES,
  type DoctorMandate,
  type DoctorMandateKindValue,
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
  Textarea,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { DoctorMandateCodeChips } from '#components/client/doctors/doctor-mandate-code-chips';
import { CodeSearchPicker } from '#components/client/encounters/code-search-picker';
import { FieldDescription } from '#components/client/shared/field-description';
import { FormLabel } from '#components/client/shared/form-label';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { RequiredLegend } from '#components/client/shared/required-legend';
import {
  doctorMandateControllerCreateMandateV1,
  getDoctorMandateControllerListMandatesV1QueryKey,
} from '#lib/api/generated/doctor-mandates/doctor-mandates';
import { notifyApiError } from '#lib/api/notify-api-error';
import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { parseApiSuccess } from '#lib/api/response';
import { isDoctorAuthorityGrantDocumentMimeType } from '#lib/doctors/is-doctor-authority-grant-document-mime-type';
import { uploadDoctorMandateInstruction } from '#lib/doctors/upload-doctor-mandate-instruction';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { useIcd9cmSearch } from '#lib/encounters/use-icd9cm-search';

const FIELD_ID_PREFIX = 'doctor-mandate';
const DOCTOR_PAGE_SIZE = 100;

type DoctorMandateFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
};

type SubmitStage = 'idle' | 'uploading' | 'saving';

/**
 * Records one written pelimpahan (P25-T05, D-036). There is no edit mode: a
 * mandate is a signed instruction, so a change is a new mandate and a revoke
 * of the old one.
 *
 * The procedures are picked as ICD-9-CM codes rather than typed, because that
 * list is exactly what the procedure gate reads — a code nobody can find is a
 * mandate that covers nothing. The instruction file is required and goes
 * through the presigned URL first; only its storage key reaches the save, and
 * the API reads the object back before recording it.
 */
export function DoctorMandateFormDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
}: DoctorMandateFormDialogProps) {
  const t = useTranslations('clinical');
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>('');
  const [mandatingDoctorId, setMandatingDoctorId] = useState<string>('');
  const [instruction, setInstruction] = useState<string>('');
  const [codes, setCodes] = useState<CodeSearchOption[]>([]);
  const [codeSearch, setCodeSearch] = useState<string>('');
  const [validFrom, setValidFrom] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [stage, setStage] = useState<SubmitStage>('idle');
  const icd9cmQuery = useIcd9cmSearch(codeSearch);
  // Doctors only: a bidan cannot pass on what she was delegated, and the API
  // refuses it anyway — the picker should not offer what will be refused.
  const doctorsQuery = useDoctorsList({
    page: 1,
    limit: DOCTOR_PAGE_SIZE,
    isActive: 'true',
    profession: 'DOCTOR',
  });

  function resolveValidationError(): string | null {
    const requiredChecks = [
      [kind === '', 'kindRequired'],
      [mandatingDoctorId === '', 'mandatingDoctorRequired'],
      [instruction.trim().length < 3, 'instructionRequired'],
      [codes.length === 0, 'proceduresRequired'],
      [validFrom === '', 'validFromRequired'],
      [validUntil === '', 'validUntilRequired'],
      [instructionFile === null, 'instructionFileRequired'],
    ] as const;
    const missingField = requiredChecks.find(([isMissing]) => isMissing);
    if (missingField) {
      return t(`doctors.mandates.form.${missingField[1]}`);
    }
    return validUntil < validFrom ? t('doctors.authorities.form.validityOrder') : null;
  }

  function handleSelectCode(option: CodeSearchOption | null): void {
    setCodeSearch('');
    if (option === null || codes.some((existing) => existing.code === option.code)) {
      return;
    }
    if (codes.length >= MAX_MANDATE_PROCEDURE_CODES) {
      setFormError(t('doctors.mandates.form.tooManyProcedures'));
      return;
    }
    setFormError(null);
    setCodes([...codes, option]);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    if (file && !isDoctorAuthorityGrantDocumentMimeType(file.type)) {
      setFormError(t('doctors.authorities.form.grantDocumentFileType'));
      setInstructionFile(null);
      return;
    }
    if (file && file.size > DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES) {
      setFormError(t('doctors.authorities.form.grantDocumentFileTooLarge'));
      setInstructionFile(null);
      return;
    }
    setFormError(null);
    setInstructionFile(file);
  }

  async function uploadChosenFile(file: File): Promise<string> {
    setStage('uploading');
    if (!isDoctorAuthorityGrantDocumentMimeType(file.type)) {
      throw new Error(t('doctors.authorities.form.grantDocumentFileType'));
    }
    return uploadDoctorMandateInstruction({ doctorId, file, mimeType: file.type });
  }

  async function saveMandate(instructionStorageKey: string): Promise<void> {
    setStage('saving');
    parseApiSuccess<DoctorMandate>(
      await doctorMandateControllerCreateMandateV1(doctorId, {
        kind: kind as DoctorMandateKindValue,
        mandatingDoctorId,
        instruction: instruction.trim(),
        icd9cmCodes: codes.map((code) => code.code),
        validFrom,
        validUntil,
        instructionStorageKey,
      }),
      t('doctors.mandates.form.error'),
    );
  }

  function resolveSaveErrorMessage(error: unknown): string {
    const code = resolveApiErrorCode(error);
    if (code === DOCTOR_MANDATE_INVALID_PARTIES_ERROR_CODE) {
      return t('doctors.mandates.form.invalidParties');
    }
    if (code === DOCTOR_MANDATE_INSTRUCTION_REQUIRED_ERROR_CODE) {
      return t('doctors.mandates.form.instructionUnreadable');
    }
    return notifyApiError(error, t('doctors.mandates.form.error'));
  }

  async function handleSubmit(): Promise<void> {
    const validationError = resolveValidationError();
    if (validationError || instructionFile === null) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      await saveMandate(await uploadChosenFile(instructionFile));
      await queryClient.invalidateQueries({
        queryKey: getDoctorMandateControllerListMandatesV1QueryKey(doctorId),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('doctors.mandates.form.title')}</DialogTitle>
          <DialogDescription>
            {t('doctors.mandates.form.description', { name: doctorName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <RequiredLegend />
          <div className="space-y-1.5">
            <FormLabel htmlFor={`${FIELD_ID_PREFIX}-kind`} required>
              {t('doctors.mandates.form.kind')}
            </FormLabel>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id={`${FIELD_ID_PREFIX}-kind`}>
                <SelectValue placeholder={t('doctors.mandates.form.kindPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {DOCTOR_MANDATE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`doctors.mandates.kind.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id={`${FIELD_ID_PREFIX}-kind-description`}>
              {kind === ''
                ? t('doctors.mandates.form.kindHint')
                : t(`doctors.mandates.kindHint.${kind as DoctorMandateKindValue}`)}
            </FieldDescription>
          </div>
          <div className="space-y-1.5">
            <FormLabel htmlFor={`${FIELD_ID_PREFIX}-mandating-doctor`} required>
              {t('doctors.mandates.form.mandatingDoctor')}
            </FormLabel>
            <DoctorCombobox
              id={`${FIELD_ID_PREFIX}-mandating-doctor`}
              doctors={doctorsQuery.doctors}
              value={mandatingDoctorId}
              isLoading={doctorsQuery.isPending}
              hasError={doctorsQuery.isError}
              onChange={setMandatingDoctorId}
            />
          </div>
          <div className="space-y-1.5">
            <FormLabel htmlFor={`${FIELD_ID_PREFIX}-instruction`} required>
              {t('doctors.mandates.form.instruction')}
            </FormLabel>
            <Textarea
              id={`${FIELD_ID_PREFIX}-instruction`}
              rows={3}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <CodeSearchPicker
              id={`${FIELD_ID_PREFIX}-procedure`}
              label={t('doctors.mandates.form.procedures')}
              placeholder={t('doctors.mandates.form.proceduresPlaceholder')}
              search={codeSearch}
              codes={icd9cmQuery.codes}
              isPending={icd9cmQuery.isPending}
              isEnabled={icd9cmQuery.isEnabled}
              selected={null}
              onSearchChange={setCodeSearch}
              onSelect={handleSelectCode}
            />
            <DoctorMandateCodeChips
              codes={codes}
              onRemove={(code) => setCodes(codes.filter((existing) => existing.code !== code))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FormLabel htmlFor={`${FIELD_ID_PREFIX}-valid-from`} required>
                {t('doctors.authorities.form.validFrom')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-valid-from`}
                value={validFrom}
                onValueChange={setValidFrom}
              />
            </div>
            <div className="space-y-1.5">
              <FormLabel htmlFor={`${FIELD_ID_PREFIX}-valid-until`} required>
                {t('doctors.authorities.form.validUntil')}
              </FormLabel>
              <DatePicker
                id={`${FIELD_ID_PREFIX}-valid-until`}
                value={validUntil}
                onValueChange={setValidUntil}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FormLabel htmlFor={`${FIELD_ID_PREFIX}-instruction-file`} required>
              {t('doctors.mandates.form.instructionFile')}
            </FormLabel>
            <Input
              id={`${FIELD_ID_PREFIX}-instruction-file`}
              type="file"
              accept={DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES.join(',')}
              onChange={handleFileChange}
            />
            <FieldDescription id={`${FIELD_ID_PREFIX}-instruction-file-description`}>
              {t('doctors.mandates.form.instructionFileHint')}
            </FieldDescription>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={isBusy} onClick={() => void handleSubmit()}>
            {stage === 'uploading'
              ? t('doctors.mandates.form.uploading')
              : stage === 'saving'
                ? t('doctors.mandates.form.saving')
                : t('doctors.mandates.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
