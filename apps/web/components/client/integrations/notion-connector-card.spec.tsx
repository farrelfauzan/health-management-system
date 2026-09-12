import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotionConnectionTestResult, NotionConnectorStatusView } from '@hms/shared-types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotionConnectorCard } from './notion-connector-card';
import {
  notionConnectorControllerGetStatusV1,
  notionConnectorControllerTestConnectionV1,
} from '#lib/api/generated/notion-connector/notion-connector';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/notion-connector/notion-connector', () => ({
  notionConnectorControllerGetStatusV1: vi.fn(),
  notionConnectorControllerTestConnectionV1: vi.fn(),
  getNotionConnectorControllerGetStatusV1QueryKey: () => ['notion-connector-status'],
}));

const statusMock = vi.mocked(notionConnectorControllerGetStatusV1);
const testMock = vi.mocked(notionConnectorControllerTestConnectionV1);

function buildStatus(overrides: Partial<NotionConnectorStatusView> = {}): NotionConnectorStatusView {
  return {
    isConfigured: true,
    apiVersion: '2025-09-03',
    dataSourceIdLast4: '5f21',
    circuitBreakerState: 'CLOSED',
    ...overrides,
  };
}

function buildTestResult(
  overrides: Partial<NotionConnectionTestResult> = {},
): NotionConnectionTestResult {
  return {
    isConfigured: true,
    isSuccessful: true,
    checkedAt: '2026-09-12T03:15:00.000Z',
    problems: [],
    ...overrides,
  };
}

function buildEnvelope<TData>(data: TData) {
  return { status: 200, headers: {}, data: { data } };
}

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <NotionConnectorCard />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('NotionConnectorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusMock.mockResolvedValue(buildEnvelope(buildStatus()) as never);
    testMock.mockResolvedValue(buildEnvelope(buildTestResult()) as never);
  });

  it('points at the server variables and offers no form when unconfigured', async () => {
    statusMock.mockResolvedValue(
      buildEnvelope(buildStatus({ isConfigured: false, dataSourceIdLast4: null })) as never,
    );

    renderCard();

    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText(/NOTION_API_TOKEN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the pinned version and only the last four characters of the board id', async () => {
    renderCard();

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('2025-09-03')).toBeInTheDocument();
    expect(screen.getByText('…5f21')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('reports a passing test', async () => {
    renderCard();
    await screen.findByText('Connected');

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    expect(
      await screen.findByText('The Bug Board has every field a bug report needs.'),
    ).toBeInTheDocument();
  });

  it('lists every problem by name when the test fails', async () => {
    testMock.mockResolvedValue(
      buildEnvelope(
        buildTestResult({
          isSuccessful: false,
          problems: [
            { field: 'Severity', expected: 'select', actual: 'missing' },
            { field: 'Report ID', expected: 'rich_text', actual: 'number' },
          ],
        }),
      ) as never,
    );
    renderCard();
    await screen.findByText('Connected');

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    expect(
      await screen.findByText('Severity: expected select, found missing'),
    ).toBeInTheDocument();
    expect(screen.getByText('Report ID: expected rich_text, found number')).toBeInTheDocument();
  });

  it('names the unshared board rather than failing generically', async () => {
    testMock.mockResolvedValue(
      buildEnvelope(
        buildTestResult({
          isSuccessful: false,
          problems: [
            {
              field: 'connection',
              expected: 'the Bug Board is readable by this integration',
              actual: 'object_not_found',
            },
          ],
        }),
      ) as never,
    );
    renderCard();
    await screen.findByText('Connected');

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/object_not_found/)).toBeInTheDocument();
  });

  it('disables the button while the test is in flight', async () => {
    let resolveTest: ((value: unknown) => void) | undefined;
    testMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTest = resolve;
      }) as never,
    );
    renderCard();
    await screen.findByText('Connected');

    await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testing/i })).toBeDisabled();
    });
    resolveTest?.(buildEnvelope(buildTestResult()));
  });
});
