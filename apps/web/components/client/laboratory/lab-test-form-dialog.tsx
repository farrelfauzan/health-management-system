'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLabTestInput,
  LabReferenceRangeInput,
  LabResultTypeValue,
  LabSpecimenTypeValue,
  LabTestView,
  UpdateLabTestInput,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabReferenceRangesEditor } from '#components/client/laboratory/lab-reference-ranges-editor';
import { LabTariffPicker } from '#components/client/laboratory/lab-tariff-picker';
import {
  labTestControllerCreateLabTestV1,
  labTestControllerReplaceReferenceRangesV1,
  labTestControllerUpdateLabTestV1,
} from '#lib/api/generated/laboratory-catalog/laboratory-catalog';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { findOverlappingReferenceRanges } from '#lib/laboratory/find-overlapping-reference-ranges';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';
import {
  toLabReferenceRangeDraft,
  toLabReferenceRangeInput,
  type LabReferenceRangeDraft,
} from '#lib/laboratory/lab-reference-range-draft';

const SPECIMEN_TYPES: readonly LabSpecimenTypeValue[] = [
  'WHOLE_BLOOD',
  'SERUM',
  'PLASMA',
  'URINE',
  'STOOL',
  'SPUTUM',
  'SWAB',
  'OTHER',
];

const RESULT_TYPES: readonly LabResultTypeValue[] = ['NUMERIC', 'TEXT', 'CODED'];

const MAX_DECIMALS = 6;

type LabTestFormDialogProps = {
  open: boolean;
  labTest: LabTestView | null;
  onOpenChange: (open: boolean) => void;
};

type LabTestSavePayload = {
  test: CreateLabTestInput | UpdateLabTestInput;
  ranges: LabReferenceRangeInput[] | null;
};

/**
 * Creates or edits one test in the catalog (`P18-T15`), reference ranges and
 * tariff included. Until this dialog a clinic that wanted a new test, or a
 * price on one, called the API by hand — which is why every lab order in the
 * dev database billed at zero.
 *
 * Two writes on save: the test, then its ranges as a whole set, because the
 * API replaces them wholesale. Deactivation is the only removal offered — a
 * test that has been ordered is deactivated, never deleted.
 */
export function LabTestFormDialog({ open, labTest, onOpenChange }: LabTestFormDialogProps) {
  const t = useTranslations('operations.laboratory.catalog');
  const tCatalog = useTranslations('operations.laboratory');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEditing = labTest !== null;
  const [code, setCode] = useState<string>(labTest?.code ?? '');
  const [name, setName] = useState<string>(labTest?.name ?? '');
  const [loincCode, setLoincCode] = useState<string>(labTest?.loincCode ?? '');
  const [loincDisplay, setLoincDisplay] = useState<string>(labTest?.loincDisplay ?? '');
  const [specimenType, setSpecimenType] = useState<LabSpecimenTypeValue>(
    labTest?.specimenType ?? 'WHOLE_BLOOD',
  );
  const [resultType, setResultType] = useState<LabResultTypeValue>(
    labTest?.resultType ?? 'NUMERIC',
  );
  const [unit, setUnit] = useState<string>(labTest?.unit ?? '');
  const [decimals, setDecimals] = useState<string>(String(labTest?.decimals ?? 0));
  const [codedOptionsText, setCodedOptionsText] = useState<string>(
    (labTest?.codedOptions ?? []).join('\n'),
  );
  const [isActive, setIsActive] = useState<boolean>(labTest?.isActive ?? true);
  const [serviceTariffId, setServiceTariffId] = useState<string>(labTest?.serviceTariffId ?? '');
  const [rangeDrafts, setRangeDrafts] = useState<LabReferenceRangeDraft[]>(
    (labTest?.referenceRanges ?? []).map((range) => toLabReferenceRangeDraft(range, range.id)),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [rangesError, setRangesError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: LabTestSavePayload) => executeSave(payload),
  });
  const isNumeric = resultType === 'NUMERIC';

  async function executeSave(payload: LabTestSavePayload): Promise<void> {
    const response = isEditing
      ? await labTestControllerUpdateLabTestV1(labTest.id, payload.test as UpdateLabTestInput)
      : await labTestControllerCreateLabTestV1(payload.test as CreateLabTestInput);
    const saved = parseApiSuccess<LabTestView>(response, t('saveError')).data;
    if (payload.ranges === null) {
      return;
    }
    try {
      parseApiSuccess<LabTestView>(
        await labTestControllerReplaceReferenceRangesV1(saved.id, { ranges: payload.ranges }),
        t('rangesSaveError'),
      );
    } catch (caughtError) {
      // The test itself is saved; say so rather than let it read as nothing was.
      throw new Error(
        caughtError instanceof Error
          ? `${t('rangesSaveError')} ${caughtError.message}`
          : t('rangesSaveError'),
      );
    }
  }

  function buildTestPayload(): CreateLabTestInput | UpdateLabTestInput | null {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (trimmedCode === '' || trimmedName === '') {
      setActionError(t('codeAndNameRequired'));
      return null;
    }
    const trimmedUnit = unit.trim();
    if (isNumeric && trimmedUnit === '') {
      setActionError(t('unitRequired'));
      return null;
    }
    const codedOptions = parseCodedOptions(codedOptionsText);
    if (resultType === 'CODED' && codedOptions.length === 0) {
      setActionError(t('codedOptionsRequired'));
      return null;
    }
    const parsedDecimals = Number(decimals.trim());
    if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > MAX_DECIMALS) {
      setActionError(t('decimalsInvalid', { max: MAX_DECIMALS }));
      return null;
    }
    const trimmedLoinc = loincCode.trim();
    const trimmedLoincDisplay = loincDisplay.trim();
    return {
      code: trimmedCode,
      name: trimmedName,
      loincCode: trimmedLoinc === '' ? null : trimmedLoinc,
      loincDisplay: trimmedLoincDisplay === '' ? null : trimmedLoincDisplay,
      specimenType,
      resultType,
      unit: isNumeric ? trimmedUnit : null,
      decimals: isNumeric ? parsedDecimals : 0,
      codedOptions: resultType === 'CODED' ? codedOptions : [],
      isActive,
      serviceTariffId: serviceTariffId === '' ? null : serviceTariffId,
    };
  }

  /**
   * Every band parsed and the set checked for collisions before anything is
   * sent: the API stores what it is given, and a result flagged against two
   * answers to "what is normal" is the failure this refuses.
   */
  function buildRangesPayload(): LabReferenceRangeInput[] | null {
    const inputs: LabReferenceRangeInput[] = [];
    for (const [index, draft] of rangeDrafts.entries()) {
      const result = toLabReferenceRangeInput(draft);
      if (result.issue !== undefined) {
        setRangesError(t(`ranges.issues.${result.issue}`, { row: index + 1 }));
        return null;
      }
      inputs.push(result.input);
    }
    const overlap = findOverlappingReferenceRanges(inputs);
    if (overlap !== null) {
      setRangesError(
        t('ranges.overlap', { first: overlap.firstIndex + 1, second: overlap.secondIndex + 1 }),
      );
      return null;
    }
    return inputs;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setRangesError(null);
    const test = buildTestPayload();
    const ranges = buildRangesPayload();
    if (test === null || ranges === null) {
      return;
    }
    try {
      // A new test with no bands needs no second write; an edit always
      // re-states the set, because the editor holds the whole of it.
      await saveMutation.mutateAsync({
        test,
        ranges: isEditing || ranges.length > 0 ? ranges : null,
      });
      await invalidateLabQueries(queryClient);
      toast.success(t('saved'));
      onOpenChange(false);
    } catch (caughtError) {
      setActionError(notifyApiError(caughtError, t('saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {isEditing ? t('editTest') : t('newTest')}
            </DialogTitle>
            <DialogDescription>{t('testDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionError ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {actionError}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-slate-700">
                {t('fields.code')}
                <Input
                  value={code}
                  placeholder="HB"
                  onChange={(event) => setCode(event.target.value)}
                  disabled={saveMutation.isPending}
                />
              </label>
              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                {t('fields.name')}
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saveMutation.isPending}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-slate-700">
                {t('fields.loinc')}
                <Input
                  value={loincCode}
                  placeholder="718-7"
                  onChange={(event) => setLoincCode(event.target.value)}
                  disabled={saveMutation.isPending}
                />
              </label>
              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                {t('fields.loincDisplay')}
                <Input
                  value={loincDisplay}
                  onChange={(event) => setLoincDisplay(event.target.value)}
                  disabled={saveMutation.isPending}
                />
              </label>
            </div>
            {loincCode.trim() === '' ? (
              <p className="text-xs text-amber-700" data-testid="lab-test-loinc-hint">
                {t('loincHint')}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-700">
                {t('fields.specimen')}
                <Select
                  value={specimenType}
                  onValueChange={(value) => setSpecimenType(value as LabSpecimenTypeValue)}
                  disabled={saveMutation.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIMEN_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tCatalog(`specimenTypes.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm text-slate-700">
                {t('fields.resultType')}
                <Select
                  value={resultType}
                  onValueChange={(value) => setResultType(value as LabResultTypeValue)}
                  disabled={saveMutation.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tCatalog(`resultTypes.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            {isNumeric ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700">
                  {t('fields.unit')}
                  <Input
                    value={unit}
                    placeholder="g/dL"
                    onChange={(event) => setUnit(event.target.value)}
                    disabled={saveMutation.isPending}
                    data-testid="lab-test-unit"
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  {t('fields.decimals')}
                  <Input
                    inputMode="numeric"
                    value={decimals}
                    onChange={(event) => setDecimals(event.target.value)}
                    disabled={saveMutation.isPending}
                  />
                </label>
              </div>
            ) : null}
            {resultType === 'CODED' ? (
              <label className="block space-y-1 text-sm text-slate-700">
                {t('fields.codedOptions')}
                <Textarea
                  value={codedOptionsText}
                  onChange={(event) => setCodedOptionsText(event.target.value)}
                  placeholder={t('fields.codedOptionsPlaceholder')}
                  disabled={saveMutation.isPending}
                  data-testid="lab-test-coded-options"
                />
                <span className="block text-xs text-slate-500">{t('fields.codedOptionsHint')}</span>
              </label>
            ) : null}
            <div className="space-y-1 text-sm text-slate-700">
              <label htmlFor="lab-test-tariff" className="block">
                {t('fields.tariff')}
              </label>
              <LabTariffPicker
                id="lab-test-tariff"
                value={serviceTariffId}
                disabled={saveMutation.isPending}
                onChange={setServiceTariffId}
              />
              <p className="text-xs text-slate-500">{t('tariffHint')}</p>
            </div>
            <LabReferenceRangesEditor
              drafts={rangeDrafts}
              isNumeric={isNumeric}
              disabled={saveMutation.isPending}
              error={rangesError}
              onChange={setRangeDrafts}
            />
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                disabled={saveMutation.isPending}
              />
              <span>
                {t('fields.active')}
                <span className="block text-xs text-slate-500">{t('deactivateHint')}</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-primary-container hover:bg-primary"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? tCommon('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One option per line, in the order they should appear; blanks and duplicates dropped. */
function parseCodedOptions(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !seen.has(line) && seen.add(line) !== undefined);
}
