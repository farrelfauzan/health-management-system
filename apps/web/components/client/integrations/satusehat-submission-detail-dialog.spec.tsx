import type { SatusehatSubmissionDetailView } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const { useDetailMock, checkMock } = vi.hoisted(() => ({
  useDetailMock: vi.fn(),
  checkMock: vi.fn(),
}));

vi.mock('#lib/integrations/use-satusehat-submission-detail', () => ({
  useSatusehatSubmissionDetail: () => useDetailMock(),
}));

vi.mock('#lib/api/generated/satusehat/satusehat', () => ({
  satusehatSubmissionControllerCheckSubmissionV1: (id: string) => checkMock(id),
}));

const { SatusehatSubmissionDetailDialog } = await import('./satusehat-submission-detail-dialog');

function buildDetail(
  overrides: Partial<SatusehatSubmissionDetailView> = {},
): SatusehatSubmissionDetailView {
  return {
    submission: {
      id: 'submission-1',
      kind: 'ENCOUNTER',
      encounterId: 'encounter-1',
      labOrderId: null,
      labOrderNumber: null,
      status: 'SUBMITTED',
      attempts: 1,
      lastError: null,
      nextAttemptAt: '2026-07-28T02:25:00.000Z',
      lastAttemptAt: '2026-07-28T02:25:04.000Z',
      submittedAt: '2026-07-28T02:25:04.000Z',
      satusehatEncounterId: 'ihs-enc-1',
      createdAt: '2026-07-28T02:20:00.000Z',
      updatedAt: '2026-07-28T02:25:04.000Z',
    },
    hasResourceList: true,
    isBackfilled: false,
    resources: [
      {
        resourceType: 'Condition',
        sentCount: 2,
        satusehatIds: ['ihs-cond-1', 'ihs-cond-2'],
        unpairedCount: 0,
        skipped: [],
      },
      {
        resourceType: 'Medication',
        sentCount: 0,
        satusehatIds: [],
        unpairedCount: 0,
        skipped: [{ reason: 'NO_KFA_CODE', count: 2 }],
      },
    ],
    ...overrides,
  };
}

function renderDialog(): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <SatusehatSubmissionDetailDialog submissionId="submission-1" onOpenChange={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('SatusehatSubmissionDetailDialog', () => {
  beforeEach(() => {
    useDetailMock.mockReset();
    checkMock.mockReset();
    useDetailMock.mockReturnValue({ detail: buildDetail(), isPending: false, error: null });
  });

  it('renders each resource type with how many were sent', () => {
    renderDialog();

    expect(screen.getByText('Condition')).toBeInTheDocument();
    expect(screen.getByText(/2 terkirim/)).toBeInTheDocument();
  });

  it('names skipped items by reason category and by count', () => {
    renderDialog();

    expect(screen.getByText(/2 dilewati: tanpa kode KFA/)).toBeInTheDocument();
  });

  /**
   * The promise the whole view is built on. The API projection is a whitelist,
   * so nothing clinical can arrive — this asserts the rendered output too, since
   * a future field added to the contract would surface here first.
   */
  it('shows no diagnosis, medicine or result text anywhere', () => {
    renderDialog();

    const rendered = document.body.textContent ?? '';
    ['J06.9', 'Paracetamol', 'Amoxicillin', 'mg/dL', 'Diarrhoea'].forEach((clinical) => {
      expect(rendered).not.toContain(clinical);
    });
  });

  it('says so when a submission predates the resource list', () => {
    useDetailMock.mockReturnValue({
      detail: buildDetail({ hasResourceList: false, resources: [] }),
      isPending: false,
      error: null,
    });

    renderDialog();

    expect(screen.getByText(/sebelum daftar sumber daya dicatat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Periksa ke SATUSEHAT/ })).not.toBeInTheDocument();
  });

  it('warns that a backfilled list cannot know what was skipped', () => {
    useDetailMock.mockReturnValue({
      detail: buildDetail({ isBackfilled: true }),
      isPending: false,
      error: null,
    });

    renderDialog();

    expect(screen.getByText(/direkonstruksi dari SATUSEHAT/)).toBeInTheDocument();
  });

  it('checks with SATUSEHAT on demand and reports each outcome', async () => {
    checkMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          submissionId: 'submission-1',
          checkedAt: '2026-07-29T04:10:00.000Z',
          results: [
            {
              resourceType: 'Condition',
              satusehatId: 'ihs-cond-1',
              outcome: 'FOUND',
              versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
              lastUpdated: '2026-07-28T02:25:04.000Z',
              status: null,
              errorCode: null,
            },
            {
              resourceType: 'Procedure',
              satusehatId: 'ihs-proc-1',
              outcome: 'NOT_FOUND',
              versionId: null,
              lastUpdated: null,
              status: null,
              errorCode: null,
            },
          ],
        },
      },
    });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /Periksa ke SATUSEHAT/ }));

    await waitFor(() => {
      expect(screen.getByText(/Ada di SATUSEHAT/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Tidak ditemukan di SATUSEHAT/)).toBeInTheDocument();
    expect(checkMock).toHaveBeenCalledWith('submission-1');
  });

  it('does not check until asked, because each check costs a read per resource', () => {
    renderDialog();

    expect(checkMock).not.toHaveBeenCalled();
  });
});
