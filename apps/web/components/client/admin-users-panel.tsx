'use client';

import { useForm } from '@tanstack/react-form';
import { type AdminUser, type AdminUsersListMeta } from '@hms/shared-types';
import {
  Button,
  Can,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';

import {
  adminManagementControllerListUsersV1,
  getAdminManagementControllerListUsersV1QueryKey,
} from '#lib/api/generated/admin-management/admin-management';
import { useApiQuery } from '#lib/api/use-api-query';
import {
  buildAdminUsersSearchParams,
  type AdminUsersSearchParams,
} from '#lib/admin-users/search-params';

type AdminUsersPanelProps = {
  initialQuery: AdminUsersSearchParams;
  initialHasAccessToken: boolean;
};

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}

function formatRoles(user: AdminUser): string {
  if (user.roles.length === 0) {
    return '-';
  }

  return user.roles.map((role) => role.name).join(', ');
}

export function AdminUsersPanel({ initialQuery, initialHasAccessToken }: AdminUsersPanelProps) {
  const router = useRouter();
  const pathname = usePathname();

  const usersQuery = useApiQuery<AdminUser[]>({
    queryKey: getAdminManagementControllerListUsersV1QueryKey({
      page: initialQuery.page,
      limit: initialQuery.limit,
      search: initialQuery.search,
    }),
    queryFn: (signal) =>
      adminManagementControllerListUsersV1(
        {
          page: initialQuery.page,
          limit: initialQuery.limit,
          search: initialQuery.search,
        },
        signal,
      ),
    errorMessage: 'Failed to load admin users',
    enabled: initialHasAccessToken,
  });

  const users = usersQuery.data ?? [];
  const meta = usersQuery.meta as AdminUsersListMeta | undefined;
  const total = meta?.total ?? users.length;
  const page = meta?.page ?? initialQuery.page;
  const limit = meta?.limit ?? initialQuery.limit;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const isReadOnlyMode = initialQuery.mode === 'readonly';

  const form = useForm({
    defaultValues: {
      search: initialQuery.search ?? '',
    },
    onSubmit: async ({ value }) => {
      const search = value.search.trim();
      const params = buildAdminUsersSearchParams({
        ...initialQuery,
        page: 1,
        search: search.length > 0 ? search : undefined,
      });

      router.replace(`${pathname}?${params.toString()}`);
    },
  });

  function navigateToPage(nextPage: number): void {
    const params = buildAdminUsersSearchParams({
      ...initialQuery,
      page: nextPage,
    });

    router.replace(`${pathname}?${params.toString()}`);
  }

  function resetFilters(): void {
    const params = buildAdminUsersSearchParams({
      ...initialQuery,
      page: 1,
      search: undefined,
    });

    form.reset({ search: '' });
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Card className="border-emerald-200/80 bg-white/90">
      <CardHeader className="gap-2">
        <CardTitle className="text-xl">Admin Users</CardTitle>
        <CardDescription>
          Unified `useApiQuery` integration with generated Orval request/key helpers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="search">
            {(field) => (
              <div className="w-full sm:max-w-sm">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Search by email
                </label>
                <Input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="doctor@hospital.com"
                />
              </div>
            )}
          </form.Field>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={usersQuery.isFetching}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
              Reset
            </Button>
            <Can action="create" subject="User">
              {!isReadOnlyMode ? (
                <Button type="button" size="sm" variant="secondary" disabled>
                  Create User (Next)
                </Button>
              ) : null}
            </Can>
          </div>
        </form>

        {!initialHasAccessToken ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Missing access token. Please sign in again.
          </p>
        ) : null}

        {usersQuery.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {usersQuery.error.message}
          </p>
        ) : null}

        <div className="rounded-xl border border-emerald-100 bg-white/90 p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>Loading users...</TableCell>
                </TableRow>
              ) : null}

              {!usersQuery.isLoading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No users found for current filters.</TableCell>
                </TableRow>
              ) : null}

              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{formatRoles(user)}</TableCell>
                  <TableCell>{user.isActive ? 'Active' : 'Inactive'}</TableCell>
                  <TableCell>{formatDateTime(user.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || usersQuery.isFetching}
              onClick={() => navigateToPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages || usersQuery.isFetching}
              onClick={() => navigateToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
