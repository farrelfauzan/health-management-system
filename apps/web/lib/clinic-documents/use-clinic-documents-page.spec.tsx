import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  documentAdminControllerListDocumentsV1: listDocumentsMock,
  getDocumentAdminControllerListDocumentsV1QueryKey: (
    params?: Record<string, unknown>,
  ): unknown[] => ['clinic-documents', params],
}));

const { useClinicDocumentsPage } = await import('./use-clinic-documents-page');
const { invalidateClinicDocumentQueries } = await import('./invalidate-clinic-document-queries');

const LIST_PARAMS = { purpose: 'FAQ_KNOWLEDGE_BASE' } as const;

function buildDocument(id: string): Record<string, unknown> {
  return {
    id,
    ownerType: 'CLINIC',
    ownerId: null,
    purpose: 'FAQ_KNOWLEDGE_BASE',
    title: `Dokumen ${id}`,
    mimeType: 'text/markdown',
    sizeBytes: 4096,
    visibility: 'BOTH',
    language: 'ID',
    ingestStatus: 'READY',
    ingestError: null,
    ingestedAt: '2026-08-06T09:07:41.000Z',
    chunkCount: 12,
    uploadedById: 'user-1',
    approval: {
      isApprovalRequired: false,
      managedDocumentId: null,
      status: null,
      pendingRound: null,
    },
    createdAt: '2026-08-06T09:05:12.000Z',
    updatedAt: '2026-08-06T09:07:41.000Z',
  };
}

function renderPageHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useClinicDocumentsPage(LIST_PARAMS), { wrapper }) };
}

describe('useClinicDocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reaches the documents a bulk upload pushed off the first page', async () => {
    // The defect this hook exists to close: the API answers with at most
    // twenty rows newest-first, and a list that read only the first page made
    // a batch of uploads look like it had replaced everything older.
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? { status: 200, data: { data: [buildDocument('doc-2')], meta: { nextCursor: null } } }
        : { status: 200, data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } } },
    );
    const { result } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.goToNextPage();
    });

    expect(result.current.pageNumber).toBe(2);
    expect(result.current.rows[0]?.id).toBe('doc-2');
    // The cursor came from the previous page's meta, and the pinned filters
    // travel with it rather than being dropped on page two.
    expect(listDocumentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ purpose: 'FAQ_KNOWLEDGE_BASE', cursor: 'doc-1' }),
      expect.anything(),
    );
  });

  it('walks the admin back when a retire leaves fewer pages than they had reached', async () => {
    // Retire the only document on page two and the list is one page long
    // again. The admin is holding a pointer to a page that no longer exists,
    // and what they must not be shown is an empty corpus they know is not
    // empty.
    let isRetired = false;
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) => {
      if (params?.cursor === 'doc-1') {
        return {
          status: 200,
          data: { data: isRetired ? [] : [buildDocument('doc-2')], meta: { nextCursor: null } },
        };
      }
      return {
        status: 200,
        data: { data: [buildDocument('doc-1')], meta: { nextCursor: isRetired ? null : 'doc-1' } },
      };
    });
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.goToNextPage();
    });
    expect(result.current.pageNumber).toBe(2);

    isRetired = true;
    await act(async () => {
      await invalidateClinicDocumentQueries(queryClient);
    });

    await waitFor(() => expect(result.current.pageNumber).toBe(1));
    expect(result.current.rows[0]?.id).toBe('doc-1');
    expect(result.current.hasPreviousPage).toBe(false);
  });

  it('walks the admin back when the page they are on comes back empty', async () => {
    // The same failure by a different route, and the one the polling makes
    // possible: this list refetches itself while an ingest is outstanding, so
    // a refetch can read page one before a retire lands and page two after
    // it. Page one still reports a cursor, page two answers with nothing, and
    // the page count never shrinks — so counting pages is not enough.
    let isRetired = false;
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? {
            status: 200,
            data: { data: isRetired ? [] : [buildDocument('doc-2')], meta: { nextCursor: null } },
          }
        : { status: 200, data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } } },
    );
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await act(async () => {
      await result.current.goToNextPage();
    });
    expect(result.current.pageNumber).toBe(2);

    isRetired = true;
    await act(async () => {
      await invalidateClinicDocumentQueries(queryClient);
    });

    await waitFor(() => expect(result.current.pageNumber).toBe(1));
    expect(result.current.rows[0]?.id).toBe('doc-1');
  });

  it('keeps the admin where they are when the page they are on survives the retire', async () => {
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? { status: 200, data: { data: [buildDocument('doc-2')], meta: { nextCursor: null } } }
        : { status: 200, data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } } },
    );
    const { result, queryClient } = renderPageHook();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      await result.current.goToNextPage();
    });
    await act(async () => {
      await invalidateClinicDocumentQueries(queryClient);
    });

    expect(result.current.pageNumber).toBe(2);
    expect(result.current.rows[0]?.id).toBe('doc-2');
  });

  it('sends the admin back to page one when a fresh batch lands there', async () => {
    listDocumentsMock.mockImplementation(async (params?: { cursor?: string }) =>
      params?.cursor === 'doc-1'
        ? { status: 200, data: { data: [buildDocument('doc-2')], meta: { nextCursor: null } } }
        : { status: 200, data: { data: [buildDocument('doc-1')], meta: { nextCursor: 'doc-1' } } },
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
