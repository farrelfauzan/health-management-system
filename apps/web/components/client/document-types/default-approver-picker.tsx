'use client';

import { useState } from 'react';
import type { DocumentTypeApproverView } from '@hms/shared-types';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { useEligibleApprovers } from '#lib/document-approvals/use-eligible-approvers';

const SEARCH_DEBOUNCE_MS = 300;

type DefaultApproverPickerProps = {
  selected: DocumentTypeApproverView[];
  onChange: (approvers: DocumentTypeApproverView[]) => void;
};

/**
 * Names the people who usually approve a type (FR-E5-38).
 *
 * Since `P19` it draws on the eligible-approver route, the same source the
 * per-document panel picker uses, so a configured default is always somebody
 * the submit endpoint will accept. A default that named a staff account
 * without `document-approval.decide:any` used to prefill happily and then be
 * refused on every submission that inherited it. The API checks again.
 */
export function DefaultApproverPicker({ selected, onChange }: DefaultApproverPickerProps) {
  const t = useTranslations('operations.documents.types.approvers');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const approversQuery = useEligibleApprovers(debouncedSearch);
  const eligible = approversQuery.approvers;
  const options: MultiComboboxOption[] = eligible.map((approver) => ({
    value: approver.id,
    label: approver.email,
    description: approver.roleCodes.join(', '),
  }));
  const knownApprovers = new Map<string, DocumentTypeApproverView>(
    [
      ...selected,
      ...eligible.map((approver) => ({ id: approver.id, email: approver.email })),
    ].map((approver) => [approver.id, approver]),
  );
  const selectedLabels = Object.fromEntries(
    selected.map((approver) => [approver.id, approver.email]),
  );

  function handleChange(ids: string[]): void {
    onChange(
      ids
        .map((id) => knownApprovers.get(id))
        .filter((approver): approver is DocumentTypeApproverView => approver !== undefined),
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
      <Label htmlFor="document-type-default-approvers">{t('label')}</Label>
      <MultiCombobox
        id="document-type-default-approvers"
        options={options}
        values={selected.map((approver) => approver.id)}
        selectedLabels={selectedLabels}
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
      <p className="text-xs text-slate-500">{t('hint')}</p>
    </div>
  );
}
