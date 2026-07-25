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
              Apply Filters
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </>
        }
      >
        <div className="w-full sm:w-56">
          <label
            htmlFor="admin-users-quick-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Quick Filter
          </label>
          <Input
            id="admin-users-quick-filter"
            placeholder="Search by email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-52">
          <label
            htmlFor="admin-users-role-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Role
          </label>
          <Select value={roleCode} onValueChange={setRoleCode}>
            <SelectTrigger id="admin-users-role-filter" className="w-full">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROLES_VALUE}>All Roles</SelectItem>
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
            Status
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="admin-users-status-filter" className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>All Statuses</SelectItem>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterCard>
    </form>
  );
}
