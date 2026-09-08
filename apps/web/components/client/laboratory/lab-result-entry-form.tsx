'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EnterLabResultsInput,
  LabOrderBenchView,
  LabOrderItemView,
  LabResultEntryInput,
  LabResultView,
  LabTestView,
} from '@hms/shared-types';
import { Button, TableBody, TableHeader, TableRow, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabResultEntryRow, type LabResultDraft } from '#components/client/laboratory/lab-result-entry-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { labResultControllerEnterLabResultsV1 } from '#lib/api/generated/laboratory-results/laboratory-results';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateLabQueries } from '#lib/laboratory/invalidate-lab-queries';
import { previewLabFlag } from '#lib/laboratory/preview-lab-flag';

type LabResultEntryFormProps = {
  bench: LabOrderBenchView;
  labTestsById: ReadonlyMap<string, LabTestView>;
};

/**
 * The worksheet (`P18-T08`). One row per live test, the value already saved
 * by a colleague pre-filled, and every row saving itself when the analis
 * leaves it — a PUT of that row alone, so two people working one rack never
 * overwrite each other. "Save all" is the belt to that brace.
 *
 * The flag beside each value is a preview computed with the server's own
 * functions against the catalog's band for this patient's sex and age at
 * collection; the saved row carries the snapshot the server actually wrote.
 */
export function LabResultEntryForm({ bench, labTestsById }: LabResultEntryFormProps) {
  const t = useTranslations('operations.laboratory.entry');
  const queryClient = useQueryClient();
  const items = bench.order.items.filter((item) => item.status !== 'CANCELLED');
  const current = pickCurrentResults(bench.results);
  const [drafts, setDrafts] = useState<Record<string, LabResultDraft>>(() =>
    Object.fromEntries(items.map((item) => [item.id, toDraft(current.get(item.id))])),
  );
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const saveMutation = useMutation({
    mutationFn: (payload: EnterLabResultsInput) =>
      labResultControllerEnterLabResultsV1(bench.order.id, payload),
  });
  const collectedAt = resolveCollectedAt(bench);

  function updateDraft(itemId: string, draft: LabResultDraft): void {
    setDrafts((previous) => ({ ...previous, [itemId]: draft }));
    setDirtyIds((previous) => new Set(previous).add(itemId));
  }

  /**
   * Saves the given drafts. A row commits its *own* draft rather than what
   * state holds, because a select fires change and commit in one tick and the
   * state the closure sees is a render behind — the value would be marked
   * dirty and never sent.
   */
  async function saveDrafts(pending: readonly { itemId: string; draft: LabResultDraft }[]): Promise<void> {
    const entries = pending
      .map(({ itemId, draft }) => toEntry(itemId, items, draft))
      .filter((entry): entry is LabResultEntryInput => entry !== null);
    if (entries.length === 0) {
      return;
    }
    try {
      parseApiSuccess(await saveMutation.mutateAsync({ items: entries }), t('error'));
      setDirtyIds((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          next.delete(entry.labOrderItemId);
        }
        return next;
      });
      toast.success(t('saved'));
      await invalidateLabQueries(queryClient);
    } catch (caughtError) {
      notifyApiError(caughtError, t('error'));
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading text-sm font-semibold text-slate-900">{t('title')}</h3>
        <p className="text-xs text-slate-500">{t('subtitle')}</p>
      </div>
      <DataTable minWidthClassName="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <DataTableHeaderCell>{t('columns.test')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('columns.value')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('columns.unit')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('columns.flag')}</DataTableHeaderCell>
            <DataTableHeaderCell>{t('columns.reference')}</DataTableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const draft = drafts[item.id] ?? toDraft(undefined);
            const labTest = labTestsById.get(item.labTestId);
            return (
              <LabResultEntryRow
                key={item.id}
                item={item}
                labTest={labTest}
                draft={draft}
                preview={previewLabFlag({
                  resultType: item.resultType,
                  ...toValues(draft),
                  referenceRanges: labTest?.referenceRanges ?? [],
                  patient: bench.patient,
                  collectedAt,
                })}
                isDirty={dirtyIds.has(item.id)}
                disabled={saveMutation.isPending}
                onChange={(next) => updateDraft(item.id, next)}
                onCommit={(next) => {
                  const saved = toDraft(current.get(item.id));
                  if (!isSameDraft(saved, next) || dirtyIds.has(item.id)) {
                    void saveDrafts([{ itemId: item.id, draft: next }]);
                  }
                }}
              />
            );
          })}
        </TableBody>
      </DataTable>
      <div className="flex items-center justify-end gap-3">
        {dirtyIds.size === 0 ? (
          <span className="text-xs text-slate-500">{t('nothingChanged')}</span>
        ) : null}
        <Button
          type="button"
          onClick={() =>
            saveDrafts(
              [...dirtyIds].map((itemId) => ({ itemId, draft: drafts[itemId] ?? toDraft(undefined) })),
            )
          }
          disabled={saveMutation.isPending || dirtyIds.size === 0}
        >
          {saveMutation.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

/** The highest version per item is what the record holds. */
function pickCurrentResults(results: readonly LabResultView[]): Map<string, LabResultView> {
  const current = new Map<string, LabResultView>();
  for (const result of results) {
    const existing = current.get(result.labOrderItemId);
    if (!existing || existing.version < result.version) {
      current.set(result.labOrderItemId, result);
    }
  }
  return current;
}

function isSameDraft(left: LabResultDraft, right: LabResultDraft): boolean {
  return (
    left.valueNumeric.trim() === right.valueNumeric.trim() &&
    left.valueText.trim() === right.valueText.trim() &&
    left.valueCoded === right.valueCoded
  );
}

function toDraft(result: LabResultView | undefined): LabResultDraft {
  return {
    valueNumeric: result?.valueNumeric === undefined ? '' : String(result.valueNumeric),
    valueText: result?.valueText ?? '',
    valueCoded: result?.valueCoded ?? '',
  };
}

function toValues(draft: LabResultDraft): {
  valueNumeric: number | null;
  valueText: string | null;
  valueCoded: string | null;
} {
  const numeric = Number(draft.valueNumeric.replace(',', '.'));
  return {
    valueNumeric:
      draft.valueNumeric.trim() === '' || Number.isNaN(numeric) ? null : numeric,
    valueText: draft.valueText.trim() === '' ? null : draft.valueText.trim(),
    valueCoded: draft.valueCoded === '' ? null : draft.valueCoded,
  };
}

/** Exactly one value, decided by the test's result type — the server's rule, applied before the round trip. */
function toEntry(
  itemId: string,
  items: readonly LabOrderItemView[],
  draft: LabResultDraft | undefined,
): LabResultEntryInput | null {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item || !draft) {
    return null;
  }
  const values = toValues(draft);
  if (item.resultType === 'NUMERIC') {
    return values.valueNumeric === null ? null : { labOrderItemId: itemId, valueNumeric: values.valueNumeric };
  }
  if (item.resultType === 'CODED') {
    return values.valueCoded === null ? null : { labOrderItemId: itemId, valueCoded: values.valueCoded };
  }
  return values.valueText === null ? null : { labOrderItemId: itemId, valueText: values.valueText };
}

/** The earliest live draw: what age at collection is measured from. */
function resolveCollectedAt(bench: LabOrderBenchView): string | null {
  const times = bench.order.specimens
    .filter((specimen) => specimen.status !== 'REJECTED')
    .map((specimen) => specimen.collectedAt)
    .sort();
  return times[0] ?? null;
}
