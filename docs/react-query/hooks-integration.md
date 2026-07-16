# Unified React Query Hook Integration

This guide defines one reusable pattern to integrate API endpoints in any component.

## 1) Use One Wrapper Hook

Use `useApiQuery` from:

- `apps/web/lib/api/use-api-query.ts`

It standardizes:

- response envelope parsing (`{ data, meta?, message? }`)
- error conversion
- query options + enabled flag
- returned shape (`data`, `meta`, `message`, `envelope`, plus native query fields)

## 2) Minimal Usage Pattern

```tsx
import {
  adminManagementControllerListUsersV1,
  getAdminManagementControllerListUsersV1QueryKey,
} from '#lib/api/generated/admin-management/admin-management';
import { useApiQuery } from '#lib/api/use-api-query';

const usersQuery = useApiQuery({
  queryKey: getAdminManagementControllerListUsersV1QueryKey({ page, limit, search }),
  queryFn: (signal) => adminManagementControllerListUsersV1({ page, limit, search }, signal),
  errorMessage: 'Failed to load users',
  enabled: hasAccessToken,
});

const users = usersQuery.data ?? [];
const total = Number((usersQuery.meta as { total?: number } | undefined)?.total ?? users.length);
```

## 3) Returned Fields

`useApiQuery(...)` returns all default TanStack Query fields plus:

- `envelope`: full API success envelope
- `data`: `envelope.data`
- `meta`: `envelope.meta`
- `message`: `envelope.message`

So in components you usually read:

- `query.data`
- `query.meta`
- `query.isLoading` / `query.isFetching`
- `query.error`

## 4) Standard Rules

- Always use generated Orval query keys (`get...QueryKey(...)`)
- Always pass generated request function through `queryFn`
- Always set a clear `errorMessage`
- Do not parse envelopes inside components manually when using this hook

## 5) Mutations (Keep Standard TanStack)

For mutations, keep using `useMutation` and invalidate with generated keys:

```tsx
await queryClient.invalidateQueries({ queryKey: getAdminManagementControllerListUsersV1QueryKey() });
```

## 6) Why This Is The Default

This gives one reusable contract across all components:

- same data/error handling
- same query key strategy
- less repetitive endpoint integration code
