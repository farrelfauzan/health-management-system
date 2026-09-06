import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedQueryParams = {
  enabled?: boolean;
  options?: { refetchInterval?: number | false; refetchIntervalInBackground?: boolean };
};

const useApiQueryMock = vi.fn<(params: CapturedQueryParams) => { data: undefined }>(() => ({
  data: undefined,
}));

vi.mock('#lib/api/use-api-query', () => ({
  useApiQuery: (params: CapturedQueryParams) => useApiQueryMock(params),
}));

const {
  INTEGRATION_MONITOR_POLL_INTERVAL_MS,
  useBpjsSubmissions,
  useSatusehatSubmissions,
} = await import('./use-integration-queries');

function lastCall(): CapturedQueryParams {
  const params = useApiQueryMock.mock.calls.at(-1)?.[0];
  if (params === undefined) {
    throw new Error('useApiQuery was never called');
  }
  return params;
}

function capturedOptions(): CapturedQueryParams['options'] {
  return lastCall().options;
}

describe('submission monitor polling', () => {
  beforeEach(() => {
    useApiQueryMock.mockClear();
  });

  it('polls the SATUSEHAT list at the worker cadence', () => {
    useSatusehatSubmissions({ page: 1, limit: 50 });

    expect(capturedOptions()?.refetchInterval).toBe(INTEGRATION_MONITOR_POLL_INTERVAL_MS);
    expect(INTEGRATION_MONITOR_POLL_INTERVAL_MS).toBe(15_000);
  });

  it('polls the BPJS list at the same cadence — one outbox, one staleness', () => {
    useBpjsSubmissions({ page: 1, limit: 50 });

    expect(capturedOptions()?.refetchInterval).toBe(INTEGRATION_MONITOR_POLL_INTERVAL_MS);
  });

  it('never polls a hidden tab', () => {
    useSatusehatSubmissions({ page: 1, limit: 50 });

    expect(capturedOptions()?.refetchIntervalInBackground).toBe(false);
  });

  it('pauses the interval while a retry is in flight for that list', () => {
    useSatusehatSubmissions({ page: 1, limit: 50 }, true, true);

    expect(capturedOptions()?.refetchInterval).toBe(false);
  });

  it('pauses without disabling the query, so the rows stay on screen', () => {
    useSatusehatSubmissions({ page: 1, limit: 50 }, true, true);

    expect(lastCall().enabled).toBe(true);
  });
});
