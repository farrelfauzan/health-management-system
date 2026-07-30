'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FilterCard } from '#components/shared/filter-card';
import type { AdminUsersSearchParams } from '#lib/admin-users/search-params';
import { useRolesList } from '#lib/rbac/use-roles-list';

const ALL_ROLES_VALUE = 'ALL';
const ALL_STATUSES_VALUE = 'ALL';

export type AdminUsersFilterValues = {
  search?: string;
  roleCode?: string;
  isActive?: 'true' | 'false';
};

type AdminUsersFilterCardProps = {
  initialQuery: AdminUsersSearchParams;
  onApply: (filters: AdminUsersFilterValues) => void;
  onReset: () => void;
};

export function AdminUsersFilterCard({
  initialQuery,
  onApply,
  onReset,
}: AdminUsersFilterCardProps) {
  const t = useTranslations('operations');
  const [search, setSearch] = useState<string>(initialQuery.search ?? '');
  const [roleCode, setRoleCode] = useState<string>(initialQuery.roleCode ?? ALL_ROLES_VALUE);
  const [status, setStatus] = useState<string>(initialQuery.isActive ?? ALL_STATUSES_VALUE);
  const rolesQuery = useRolesList();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const trimmedSearch = search.trim();
    onApply({
      search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
      roleCode: roleCode === ALL_ROLES_VALUE ? undefined : roleCode,
      isActive: status === ALL_STATUSES_VALUE ? undefined : (status as 'true' | 'false'),
    });
  }

  function handleReset(): void {
    setSearch('');
    setRoleCode(ALL_ROLES_VALUE);
    setStatus(ALL_STATUSES_VALUE);
    onReset();
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <FilterCard
        actions={
          <>
            <Button type="submit" size="sm" className="bg-primary-container hover:bg-primary">
              {t('common.applyFilters')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              {t('common.reset')}
            </Button>
          </>
        }
      >
        <div className="w-full sm:w-56">
          <label
            htmlFor="admin-users-quick-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('common.quickFilter')}
          </label>
          <Input
            id="admin-users-quick-filter"
            placeholder={t('administration.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-52">
          <label
            htmlFor="admin-users-role-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('administration.role')}
          </label>
          <Select value={roleCode} onValueChange={setRoleCode}>
            <SelectTrigger id="admin-users-role-filter" className="w-full">
              <SelectValue placeholder={t('administration.allRoles')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROLES_VALUE}>{t('administration.allRoles')}</SelectItem>
              {rolesQuery.roles.map((role) => (
                <SelectItem key={role.id} value={role.code}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <label
            htmlFor="admin-users-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('common.status')}
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="admin-users-status-filter" className="w-full">
              <SelectValue placeholder={t('common.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>{t('common.allStatuses')}</SelectItem>
              <SelectItem value="true">{t('common.active')}</SelectItem>
              <SelectItem value="false">{t('common.inactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterCard>
    </form>
  );
}
