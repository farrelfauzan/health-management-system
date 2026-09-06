'use client';

import { useState } from 'react';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { useAdminUsersList } from '#lib/admin-users/use-admin-users-list';
import { filterStaffUsers } from '#lib/managed-documents/filter-staff-users';

const SEARCH_DEBOUNCE_MS = 300;
const STAFF_OPTIONS_LIMIT = 50;

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
 * Patients are never offered ({@link filterStaffUsers}); the API refuses one
 * on the panel regardless, and that refusal is the one that counts.
 */
export function ApproverPicker({ selected, onChange }: ApproverPickerProps) {
  const t = useTranslations('operations.documents.approvals.picker');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const usersQuery = useAdminUsersList({
    page: 1,
    limit: STAFF_OPTIONS_LIMIT,
    isActive: 'true',
    ...(debouncedSearch === '' ? {} : { search: debouncedSearch }),
  });
  const staff = filterStaffUsers(usersQuery.users);
  const options: MultiComboboxOption[] = staff.map((user) => ({
    value: user.id,
    label: user.email,
    description: user.roles.map((role) => role.code).join(', '),
  }));
  const knownApprovers = new Map<string, ApproverOption>(
    [...selected, ...staff.map((user) => ({ id: user.id, email: user.email }))].map((approver) => [
      approver.id,
      approver,
    ]),
  );

  function handleChange(ids: string[]): void {
    onChange(
      ids
        .map((id) => knownApprovers.get(id))
        .filter((approver): approver is ApproverOption => approver !== undefined),
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
        isLoading={usersQuery.isPending}
        hasError={usersQuery.isError}
        searchValue={search}
        onSearchValueChange={setSearch}
        shouldFilter={false}
        removeLabel={(label) => t('remove', { email: label })}
        onChange={handleChange}
      />
    </div>
  );
}
