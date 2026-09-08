'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

type ReactQueryProviderProps = {
  children: ReactNode;
};

/**
 * How long a fetched result is treated as current.
 *
 * TanStack's own default is `0`, which means every result is stale the instant
 * it lands and any component mounting refetches it — a tab switch, a dialog
 * opening, a navigation back to a screen just left. Across 100-odd query call
 * sites that is a lot of requests nobody asked for, and each one is a database
 * read on a clinic's single RDS instance.
 *
 * Thirty seconds is chosen against how the screens are actually read: a
 * worklist glanced at, a list scrolled, a patient opened and closed. Anything
 * that must be fresher already says so — a `refetchInterval` ignores this
 * entirely, and the few reads where staleness would be wrong (patient and
 * doctor identifiers) set `staleTime: 0` explicitly and keep it.
 *
 * A mutation still invalidates what it touched, so an edit is visible at once:
 * this delays refetching *unchanged* data, not seeing your own changes.
 */
const DEFAULT_STALE_TIME_MS = 30_000;

export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: DEFAULT_STALE_TIME_MS,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
