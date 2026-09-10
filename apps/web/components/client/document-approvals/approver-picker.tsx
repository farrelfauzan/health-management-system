'use client';

import { useState } from 'react';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { useEligibleApprovers } from '#lib/document-approvals/use-eligible-approvers';

const SEARCH_DEBOUNCE_MS = 300;

export type ApproverOption = { id: string; email: string };

type ApproverPickerProps = {
  selected: ApproverOption[];
  onChange: (approvers: ApproverOption[]) => void;
};

/**
 * Who approves *this* document (`P16-T31`, FR-E5-09). Pre-filled from the
 * type's defaults by the dialog around it, and freely changed here — the
 * defaults are a convenience, never a routing rule.
 *
 * Since `P19` the options come from the eligible-approver route rather than
 * from the whole staff directory. "Eligible" is the permission that governs
 * the decision, `document-approval.decide:any`, which is what the product
 * owner's "it should have admin role" resolves to in the seed. Offering
 * anybody else was worse than useless: the submit succeeded, and the round
 * then waited forever on a signature the named person could not give. The API
 * refuses an ineligible name regardless, and that refusal is the one that
 * counts.
 */
export function ApproverPicker({ selected, onChange }: ApproverPickerProps) {
  const t = useTranslations('operations.documents.approvals.picker');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const approversQuery = useEligibleApprovers(debouncedSearch);
  const eligible = approversQuery.approvers;
  const options: MultiComboboxOption[] = eligible.map((approver) => ({
    value: approver.id,
    label: approver.email,
    description: approver.roleCodes.join(', '),
  }));
  const knownApprovers = new Map<string, ApproverOption>(
    [
      ...selected,
      ...eligible.map((approver) => ({ id: approver.id, email: approver.email })),
    ].map((approver) => [approver.id, approver]),
  );

  function handleChange(ids: string[]): void {
    onChange(
      ids
        .map((id) => knownApprovers.get(id))
        .filter((approver): approver is ApproverOption => approver !== undefined),
    );
  }

  function resolveEmptyMessage(): string {
    if (approversQuery.isPending) {
      return t('searchPlaceholder');
    }
    return approversQuery.isError ? t('loadError') : t('empty');
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="document-approvers">{t('label')}</Label>
      <MultiCombobox
        id="document-approvers"
        options={options}
        values={selected.map((approver) => approver.id)}
        selectedLabels={Object.fromEntries(
          selected.map((approver) => [approver.id, approver.email]),
        )}
        placeholder={t('placeholder')}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={resolveEmptyMessage()}
        isLoading={approversQuery.isPending}
        hasError={approversQuery.isError}
        searchValue={search}
        onSearchValueChange={setSearch}
        shouldFilter={false}
        removeLabel={(label) => t('remove', { email: label })}
        onChange={handleChange}
      />
      <p className="text-xs text-slate-500">{t('eligibleOnlyHint')}</p>
    </div>
  );
}
