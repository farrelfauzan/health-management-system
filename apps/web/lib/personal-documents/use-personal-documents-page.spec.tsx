import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  personalDocumentControllerListDocumentsV1: listDocumentsMock,
  getPersonalDocumentControllerListDocumentsV1QueryKey: () => ['personal-documents'],
}));

const { usePersonalDocumentsPage } = await import('./use-personal-documents-page');
const { invalidatePersonalDocumentQueries } = await import(
  './invalidate-personal-document-queries'
);

function buildDocument(id: string): Record<string, unknown> {
  return {
    id,
    ownerType: 'DOCTOR',
    ownerId: 'user-1',
    purpose: 'PERSONAL_KNOWLEDGE_BASE',
    title: `Dokumen ${id}`,
    mimeType: 'application/pdf',
    sizeBytes: 96256,
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-05T09:07:41.000Z',
    chunkCount: 24,
    createdAt: '2026-08-05T09:05:12.000Z',
    updatedAt: '2026-08-05T09:07:41.000Z',
  };
}

function renderPageHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => usePersonalDocumentsPage(), { wrapper }) };
}

describe('usePersonalDocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('walks the owner back when a delete leaves fewer pages than they had reached', async () => {
    // Delete the only document on page two and the list is one page long
    // again. The owner is holding a pointer to a page that no longer exists,
    // and what they must not be shown is an empty knowledge base they know
    // is not empty.
    let isDeleted = false;
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) => {
      if (params?.cursor === 'doc-1') {
        return {
          status: 200,
          data: { data: isDeleted ? [] : [buildDocument('doc-2')], meta: { nextCursor: null } },
        };
      }
      return {
        status: 200,
        data: { data: [buildDocument('doc-1')], meta: { nextCursor: isDeleted ? null : 'doc-1' } },
      };
    });
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.goToNextPage();
    });
    expect(result.current.pageNumber).toBe(2);
    expect(result.current.rows[0]?.id).toBe('doc-2');

    isDeleted = true;
    await act(async () => {
      await invalidatePersonalDocumentQueries(queryClient);
    });

    await waitFor(() => expect(result.current.pageNumber).toBe(1));
    expect(result.current.rows[0]?.id).toBe('doc-1');
    expect(result.current.hasPreviousPage).toBe(false);
  });

  it('walks the owner back when the page they are on comes back empty', async () => {
    // The same failure by a different route, and the one the polling makes
    // possible: this list refetches itself while an ingest is outstanding, so
    // a refetch can read page one before a delete lands and page two after
    // it. Page one still reports a cursor, page two answers with nothing, and
    // the page count never shrinks — so counting pages is not enough. What
    // decides where the owner ends up is where the rows actually are.
    let isDeleted = false;
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? {
            status: 200,
            data: {
              data: isDeleted ? [] : [buildDocument('doc-2')],
              meta: { nextCursor: null },
            },
          }
        : {
            status: 200,
            data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } },
          },
    );
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => {
      await result.current.goToNextPage();
    });
    expect(result.current.pageNumber).toBe(2);

    isDeleted = true;
    await act(async () => {
      await invalidatePersonalDocumentQueries(queryClient);
    });

    await waitFor(() => expect(result.current.pageNumber).toBe(1));
    expect(result.current.rows[0]?.id).toBe('doc-1');
  });

  it('keeps the owner where they are when the page they are on survives the delete', async () => {
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? {
            status: 200,
            data: { data: [buildDocument('doc-2')], meta: { nextCursor: null } },
          }
        : {
            status: 200,
            data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } },
          },
    );
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.goToNextPage();
    });
    await act(async () => {
      await invalidatePersonalDocumentQueries(queryClient);
    });

    expect(result.current.pageNumber).toBe(2);
    expect(result.current.rows[0]?.id).toBe('doc-2');
  });

  it('sends the owner back to page one when a fresh upload lands there', async () => {
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? {
            status: 200,
            data: { data: [buildDocument('doc-2')], meta: { nextCursor: null } },
          }
        : {
            status: 200,
            data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } },
          },
    );
    const { result } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => {
      await result.current.goToNextPage();
    });

    act(() => {
      result.current.resetPage();
    });

    expect(result.current.pageNumber).toBe(1);
    expect(result.current.rows[0]?.id).toBe('doc-1');
  });
});
