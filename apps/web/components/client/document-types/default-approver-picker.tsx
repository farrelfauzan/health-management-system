'use client';

import { useState } from 'react';
import type { DocumentTypeApproverView } from '@hms/shared-types';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { useAdminUsersList } from '#lib/admin-users/use-admin-users-list';

const SEARCH_DEBOUNCE_MS = 300;
const STAFF_OPTIONS_LIMIT = 50;
const PATIENT_ROLE_CODE = 'PATIENT';

type DefaultApproverPickerProps = {
  selected: DocumentTypeApproverView[];
  onChange: (approvers: DocumentTypeApproverView[]) => void;
};

/**
 * Names the staff who usually approve a type (FR-E5-38). Draws on the admin
 * user list — this screen sits behind `user.read:any` in practice — and
 * drops anyone holding the PATIENT role client-side so the picker never
 * offers what the API would refuse (§7.5.4). The API checks again.
 */
export function DefaultApproverPicker({ selected, onChange }: DefaultApproverPickerProps) {
  const t = useTranslations('operations.documents.types.approvers');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const usersQuery = useAdminUsersList({
    page: 1,
    limit: STAFF_OPTIONS_LIMIT,
    isActive: 'true',
    ...(debouncedSearch === '' ? {} : { search: debouncedSearch }),
  });
  const staff = usersQuery.users.filter(
    (user) => !user.roles.some((role) => role.code === PATIENT_ROLE_CODE),
  );
  const options: MultiComboboxOption[] = staff.map((user) => ({
    value: user.id,
    label: user.email,
    description: user.roles.map((role) => role.code).join(', '),
  }));
  const knownApprovers = new Map<string, DocumentTypeApproverView>(
    [...selected, ...staff.map((user) => ({ id: user.id, email: user.email }))].map((approver) => [
      approver.id,
      approver,
    ]),
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
    if (usersQuery.isPending) {
      return t('searchPlaceholder');
    }
    return usersQuery.isError ? t('loadError') : t('empty');
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
        isLoading={usersQuery.isPending}
        hasError={usersQuery.isError}
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
