import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReactQueryProvider } from './react-query-provider';

/** Counts how many times a query actually goes to the network. */
function buildCountingQuery() {
  const queryFn = vi.fn(async () => ({ value: 'ok' }));

  function Consumer() {
    const query = useQuery({ queryKey: ['/api/v1/measure'], queryFn });
    return <span>{query.isSuccess ? 'loaded' : 'loading'}</span>;
  }

  return { queryFn, Consumer };
}

describe('ReactQueryProvider defaults', () => {
  it('does not refetch an unchanged query when a component remounts', async () => {
    const { queryFn, Consumer } = buildCountingQuery();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
    });

    const first = render(
      <QueryClientProvider client={client}>
        <Consumer />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
    first.unmount();

    // The same screen, opened again a moment later — a tab switch, a dialog
    // closing, a navigation back.
    const second = render(
      <QueryClientProvider client={client}>
        <Consumer />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
    second.unmount();

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('refetches on every remount without a staleTime — the behaviour this replaces', async () => {
    const { queryFn, Consumer } = buildCountingQuery();
    // TanStack's own default. Kept here as the control: it is what the app did
    // before, and what it will do again if the default is ever removed.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
    });

    for (let mount = 0; mount < 3; mount += 1) {
      const view = render(
        <QueryClientProvider client={client}>
          <Consumer />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
      view.unmount();
    }

    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('ships a staleTime, so the default above cannot quietly come back', () => {
    let shipped: number | undefined;

    function Probe() {
      // Read from the client the provider actually built, rather than
      // restating the value here — a copy would pass whatever the provider did.
      shipped = useQueryClient().getDefaultOptions().queries?.staleTime as number | undefined;
      return null;
    }

    render(
      <ReactQueryProvider>
        <Probe />
      </ReactQueryProvider>,
    );

    expect(shipped).toBeGreaterThan(0);
  });
});
