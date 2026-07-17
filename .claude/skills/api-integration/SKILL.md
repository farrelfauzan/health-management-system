---
name: nextjs-api-integration-orval
description: Generate and maintain API integrations for Next.js using Orval, TanStack Query, and OpenAPI. Treat openapi.yaml as the source of truth.
---

# Next.js API Integration Skill (Orval + TanStack Query)

## Purpose

You are responsible for implementing and maintaining API integrations in this project.

The API contract is defined exclusively by `openapi.yaml`.

Never manually create or modify generated API clients.

Always use Orval-generated clients and TanStack Query hooks.

---

# Source of Truth

The following files define the backend API:

- openapi.yaml
- openapi.yml

If the implementation differs from the OpenAPI specification, the specification is always correct.

Never guess request or response structures.

---

# General Rules

## DO

- Read the OpenAPI specification before implementing anything.
- Use generated Orval clients.
- Use generated TanStack Query hooks whenever available.
- Keep API logic separated from UI.
- Keep components focused on presentation.
- Use React Query for all server state.
- Use mutations for write operations.
- Use query invalidation after successful mutations.
- Reuse generated schemas and types.
- Keep API calls type-safe.

## DO NOT

- Do not use fetch() directly.
- Do not use axios directly unless it is the configured Orval mutator.
- Do not duplicate generated interfaces.
- Do not manually create API types.
- Do not manually write API hooks that already exist.
- Do not modify generated files.
- Do not edit anything inside generated folders.

---

# Directory Structure

Example:

```
src/
    api/
        generated/
        mutator.ts
        orval.config.ts

    features/
        users/
        products/
        auth/

    components/

    hooks/

    providers/
```

Generated code should remain isolated.

Application logic belongs inside feature folders.

---

# Code Generation

Whenever the OpenAPI specification changes:

1. Update `openapi.yaml`
2. Regenerate clients

Example:

```bash
pnpm orval
```

or

```bash
npm run generate:api
```

Never manually synchronize generated code.

---

# Using Generated Hooks

Preferred:

```tsx
const { data, isLoading } = useGetUsers();
```

Mutations:

```tsx
const mutation = useCreateUser();

mutation.mutate(payload);
```

Never wrap generated hooks unless additional business logic is required.

---

# Query Keys

Always use generated query keys if available.

Never manually duplicate query keys.

When invalidating:

```tsx
queryClient.invalidateQueries(...)
```

Use the generated query key helpers whenever available.

---

# Mutations

After successful mutations:

- invalidate affected queries
- update cache when appropriate
- avoid unnecessary refetches

Prefer optimistic updates only when beneficial.

---

# Error Handling

Display meaningful UI errors.

Never swallow exceptions.

Map API validation errors to forms when possible.

Unexpected server errors should surface through the application's global error handling.

---

# Authentication

Authentication headers should be handled by the configured mutator.

Do not manually attach Authorization headers inside components.

Use the centralized HTTP client.

---

# Pagination

Follow the pagination defined by OpenAPI.

Never invent pagination formats.

If the API returns:

```
page
pageSize
total
items
```

Use exactly those fields.

---

# Filtering

Use only filters defined by the API.

Do not invent query parameters.

---

# Forms

Form payloads must exactly match generated request types.

Use generated DTOs.

Never recreate interfaces manually.

---

# File Uploads

If OpenAPI specifies multipart/form-data:

Use the generated mutation.

Use FormData only when required by the specification.

---

# Caching

Use TanStack Query defaults unless the feature explicitly requires:

- staleTime
- gcTime
- refetchOnWindowFocus
- retry

Avoid unnecessary overrides.

---

# Business Logic

Business logic belongs inside:

```
features/
```

Avoid putting business rules inside components.

---

# Components

Components should:

- call generated hooks
- render UI
- handle user interaction

Components should NOT:

- build URLs
- transform API contracts
- perform HTTP requests

---

# Data Transformation

If API responses need transformation:

Perform transformations using:

- select
- utility functions
- feature services

Never modify generated models.

---

# OpenAPI Changes

Whenever an endpoint changes:

1. Update openapi.yaml
2. Regenerate clients
3. Fix TypeScript errors
4. Update affected UI
5. Verify cache invalidation

Never manually patch generated code.

---

# When Adding a New Endpoint

Always follow this workflow:

1. Verify endpoint exists in OpenAPI.
2. Regenerate Orval client.
3. Use generated hook.
4. Implement UI.
5. Handle loading.
6. Handle errors.
7. Handle empty states.
8. Handle success.
9. Invalidate queries if necessary.

---

# If an Endpoint Does Not Exist

Never invent endpoints.

Instead:

- Explain that the endpoint is missing.
- Recommend updating openapi.yaml.
- Wait for regeneration.

---

# Pull Requests

API-related PRs should include:

## Summary

Describe the feature.

## API Changes

List affected endpoints.

## Generated Files

Mention regenerated Orval files.

## Testing

Explain how the API integration was verified.

---

# Code Quality

Prefer:

- strict typing
- generated DTOs
- generated hooks
- reusable feature modules
- React Query best practices

Avoid:

- any
- duplicated interfaces
- manual fetch
- duplicated API clients
- editing generated files

---

# Golden Rule

The OpenAPI specification is the single source of truth.

Whenever there is uncertainty:

1. Read `openapi.yaml`.
2. Regenerate with Orval.
3. Use generated types and hooks.

Never implement an API contract that is not defined in the specification.