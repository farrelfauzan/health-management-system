'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateLabPanelInput, LabPanelView, UpdateLabPanelInput } from '@hms/shared-types';
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
  MultiCombobox,
  type MultiComboboxOption,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabTariffPicker } from '#components/client/laboratory/lab-tariff-picker';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  labPanelControllerCreateLabPanelV1,
  labPanelControllerUpdateLabPanelV1,
} from '#lib/api/generated/laboratory-catalog/laboratory-catalog';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';
import { useLabTests } from '#lib/laboratory/use-lab-tests';

type LabPanelFormDialogProps = {
  open: boolean;
  labPanel: LabPanelView | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Creates or edits a panel (`P18-T15`): the tests a clinic sells together,
 * in the order they print on the report — which is the order they are picked
 * here. Only active tests are offered as members; a panel is deactivated,
 * never deleted, for the reason a test is.
 */
export function LabPanelFormDialog({ open, labPanel, onOpenChange }: LabPanelFormDialogProps) {
  const t = useTranslations('operations.laboratory.catalog');
  const tCommon = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const isEditing = labPanel !== null;
  const [code, setCode] = useState<string>(labPanel?.code ?? '');
  const [name, setName] = useState<string>(labPanel?.name ?? '');
  const [labTestIds, setLabTestIds] = useState<string[]>(
    (labPanel?.members ?? []).map((member) => member.labTestId),
  );
  const [isActive, setIsActive] = useState<boolean>(labPanel?.isActive ?? true);
  const [serviceTariffId, setServiceTariffId] = useState<string>(labPanel?.serviceTariffId ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const testsQuery = useLabTests('');
  const saveMutation = useMutation({
    mutationFn: (payload: CreateLabPanelInput | UpdateLabPanelInput) =>
      isEditing
        ? labPanelControllerUpdateLabPanelV1(labPanel.id, payload as UpdateLabPanelInput)
        : labPanelControllerCreateLabPanelV1(payload as CreateLabPanelInput),
  });
  // A member that has since been deactivated stays selectable so an existing
  // panel keeps its shape; only new picks are limited to active tests.
  const memberOptions: MultiComboboxOption[] = testsQuery.labTests
    .filter((labTest) => labTest.isActive || labTestIds.includes(labTest.id))
    .map((labTest) => ({
      value: labTest.id,
      label: labTest.name,
      description: labTest.code,
      keywords: [labTest.code],
    }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (trimmedCode === '' || trimmedName === '') {
      setActionError(t('codeAndNameRequired'));
      return;
    }
    if (labTestIds.length === 0) {
      setActionError(t('membersRequired'));
      return;
    }
    const payload: CreateLabPanelInput = {
      code: trimmedCode,
      name: trimmedName,
      labTestIds,
      isActive,
      serviceTariffId: serviceTariffId === '' ? null : serviceTariffId,
    };
    try {
      parseApiSuccess<LabPanelView>(await saveMutation.mutateAsync(payload), t('saveError'));
      await invalidateLabQueries(queryClient);
      toast.success(t('saved'));
      onOpenChange(false);
    } catch (caughtError) {
      setActionError(notifyApiError(caughtError, t('saveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {isEditing ? t('editPanel') : t('newPanel')}
            </DialogTitle>
            <DialogDescription>{t('panelDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionError ? <InlineNotice tone="error">{actionError}</InlineNotice> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-slate-700">
                {t('fields.code')}
                <Input
                  value={code}
                  placeholder="DL"
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
            <div className="space-y-1 text-sm text-slate-700">
              <label htmlFor="lab-panel-members" className="block">
                {t('fields.members')}
              </label>
              <MultiCombobox
                id="lab-panel-members"
                options={memberOptions}
                values={labTestIds}
                onChange={setLabTestIds}
                isLoading={testsQuery.isPending}
                disabled={saveMutation.isPending}
                placeholder={t('fields.membersPlaceholder')}
                searchPlaceholder={t('search')}
                emptyMessage={t('noMatches')}
              />
              <p className="text-xs text-slate-500">{t('fields.membersHint')}</p>
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              <label htmlFor="lab-panel-tariff" className="block">
                {t('fields.tariff')}
              </label>
              <LabTariffPicker
                id="lab-panel-tariff"
                value={serviceTariffId}
                disabled={saveMutation.isPending}
                onChange={setServiceTariffId}
              />
              <p className="text-xs text-slate-500">{t('tariffHint')}</p>
            </div>
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
