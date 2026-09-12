import { Logger } from '@nestjs/common';

import { NotionHttpClient } from './notion-http.client';
import { NotionError } from './notion.error';
import { NotionConfig } from './notion.types';

const TOKEN = 'ntn_secret_token_value_that_must_never_be_logged';
const DATA_SOURCE_ID = '11111111-2222-4333-8444-555555555555';

function buildConfig(overrides: Partial<NotionConfig> = {}): NotionConfig {
  return {
    isConfigured: true,
    apiToken: TOKEN,
    bugBoardDataSourceId: DATA_SOURCE_ID,
    requestTimeoutMs: 50,
    maxRequestsPerSecond: 1000,
    circuitBreakerFailureThreshold: 2,
    circuitBreakerOpenDurationMs: 30_000,
    ...overrides,
  };
}

function buildResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function buildTimeoutError(): Error {
  const timeoutError = new Error('The operation was aborted due to timeout');
  timeoutError.name = 'TimeoutError';
  return timeoutError;
}

describe('NotionHttpClient', () => {
  let mockFetch: jest.Mock;
  let loggedLines: string[];

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    loggedLines = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      loggedLines.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('request shape', () => {
    it('parents a created page to the configured data source, not a database', async () => {
      mockFetch.mockResolvedValue(buildResponse(200, { id: 'page-1' }));
      const client = new NotionHttpClient(buildConfig());
      await client.createPage({ properties: { 'Report ID': { rich_text: [] } } });
      const [requestUrl, requestInit] = mockFetch.mock.calls[0];
      expect(requestUrl).toBe('https://api.notion.com/v1/pages');
      expect(JSON.parse(String(requestInit.body)).parent).toEqual({
        type: 'data_source_id',
        data_source_id: DATA_SOURCE_ID,
      });
    });

    it('pins the API version and authorises with the token', async () => {
      mockFetch.mockResolvedValue(buildResponse(200, { id: 'page-1' }));
      const client = new NotionHttpClient(buildConfig());
      await client.createPage({ properties: {} });
      const requestHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(requestHeaders['Notion-Version']).toBe('2025-09-03');
      expect(requestHeaders.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(client.getApiVersion()).toBe('2025-09-03');
    });

    it('queries the data source, not the database, for the Report-ID lookup', async () => {
      mockFetch.mockResolvedValue(buildResponse(200, { results: [] }));
      const client = new NotionHttpClient(buildConfig());
      await client.queryDataSource({ filter: { property: 'Report ID' }, pageSize: 1 });
      expect(mockFetch.mock.calls[0][0]).toBe(
        `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`,
      );
      expect(JSON.parse(String(mockFetch.mock.calls[0][1].body)).page_size).toBe(1);
    });

    it('refuses every call on a deployment with no credentials', async () => {
      const client = new NotionHttpClient(buildConfig({ isConfigured: false, apiToken: undefined }));
      expect(client.isConfigured()).toBe(false);
      await expect(client.createPage({ properties: {} })).rejects.toMatchObject({
        kind: 'PERMANENT',
        notionCode: 'not_configured',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('error mapping', () => {
    it.each([
      [400, 'validation_error'],
      [401, 'unauthorized'],
      [403, 'restricted_resource'],
      [404, 'object_not_found'],
    ])('maps HTTP %s to PERMANENT', async (inputStatus, inputCode) => {
      mockFetch.mockResolvedValue(buildResponse(inputStatus, { code: inputCode }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.createPage({ properties: {} })).rejects.toMatchObject({
        kind: 'PERMANENT',
        statusCode: inputStatus,
        notionCode: inputCode,
      });
    });

    it('maps an edit conflict to RETRYABLE', async () => {
      mockFetch.mockResolvedValue(buildResponse(409, { code: 'conflict_error' }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.queryDataSource()).rejects.toMatchObject({ kind: 'RETRYABLE' });
    });

    it('maps a 5xx on a read to RETRYABLE', async () => {
      mockFetch.mockResolvedValue(buildResponse(502, { code: 'internal_server_error' }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.retrieveDataSource()).rejects.toMatchObject({ kind: 'RETRYABLE' });
    });

    it('maps a 5xx on a create to AMBIGUOUS, because the page may exist', async () => {
      mockFetch.mockResolvedValue(buildResponse(500, { code: 'internal_server_error' }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.createPage({ properties: {} })).rejects.toMatchObject({
        kind: 'AMBIGUOUS',
      });
    });

    it('maps a timeout on a read to RETRYABLE', async () => {
      mockFetch.mockRejectedValue(buildTimeoutError());
      const client = new NotionHttpClient(buildConfig());
      await expect(client.queryDataSource()).rejects.toMatchObject({
        kind: 'RETRYABLE',
        notionCode: 'timeout',
      });
    });

    it('maps a timeout on a create to AMBIGUOUS and does not retry it', async () => {
      mockFetch.mockRejectedValue(buildTimeoutError());
      const client = new NotionHttpClient(buildConfig());
      await expect(client.createPage({ properties: {} })).rejects.toMatchObject({
        kind: 'AMBIGUOUS',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting', () => {
    let recordedWaitsMs: number[] = [];

    beforeEach(() => {
      recordedWaitsMs = [];
      jest.spyOn(global, 'setTimeout').mockImplementation(((
        callback: () => void,
        durationMs: number,
      ) => {
        recordedWaitsMs.push(durationMs);
        callback();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
    });

    it('waits at least the Retry-After it was given, then creates exactly one page', async () => {
      mockFetch
        .mockResolvedValueOnce(buildResponse(429, { code: 'rate_limited' }, { 'Retry-After': '2' }))
        .mockResolvedValueOnce(buildResponse(200, { id: 'page-1' }));
      const client = new NotionHttpClient(buildConfig());
      const actualPage = await client.createPage({ properties: {} });
      expect(actualPage.id).toBe('page-1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(Math.max(...recordedWaitsMs)).toBeGreaterThanOrEqual(2000);
    });

    it('falls back to a wait when Notion sends no Retry-After', async () => {
      mockFetch
        .mockResolvedValueOnce(buildResponse(429, { code: 'rate_limited' }))
        .mockResolvedValueOnce(buildResponse(200, { id: 'page-1' }));
      const client = new NotionHttpClient(buildConfig());
      await client.createPage({ properties: {} });
      expect(Math.max(...recordedWaitsMs)).toBeGreaterThanOrEqual(1000);
    });

    it('gives up after the attempt cap and hands the rate limit back', async () => {
      mockFetch.mockResolvedValue(buildResponse(529, { code: 'service_overload' }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.createPage({ properties: {} })).rejects.toMatchObject({
        kind: 'RETRYABLE',
        statusCode: 529,
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker', () => {
    it('opens after the configured number of unreachable attempts', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.queryDataSource()).rejects.toBeInstanceOf(NotionError);
      await expect(client.queryDataSource()).rejects.toBeInstanceOf(NotionError);
      expect(client.getCircuitBreakerState()).toBe('OPEN');
      await expect(client.queryDataSource()).rejects.toMatchObject({
        notionCode: 'circuit_open',
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('keeps the circuit closed when Notion answers, even with a rejection', async () => {
      mockFetch.mockResolvedValue(buildResponse(400, { code: 'validation_error' }));
      const client = new NotionHttpClient(buildConfig());
      await expect(client.queryDataSource()).rejects.toBeInstanceOf(NotionError);
      await expect(client.queryDataSource()).rejects.toBeInstanceOf(NotionError);
      await expect(client.queryDataSource()).rejects.toBeInstanceOf(NotionError);
      expect(client.getCircuitBreakerState()).toBe('CLOSED');
    });
  });

  describe('logging', () => {
    it('logs the operation, status and Notion code, and never the token or the body', async () => {
      mockFetch.mockResolvedValue(
        buildResponse(400, { code: 'validation_error', message: 'body.properties is not valid' }),
      );
      const client = new NotionHttpClient(buildConfig());
      await expect(
        client.createPage({ properties: { Title: { title: [{ text: { content: 'rahasia' } }] } } }),
      ).rejects.toBeInstanceOf(NotionError);
      expect(loggedLines).toHaveLength(1);
      expect(loggedLines[0]).toContain('notion_request_failed');
      expect(loggedLines[0]).toContain('create_page');
      expect(loggedLines[0]).toContain('validation_error');
      expect(loggedLines[0]).not.toContain(TOKEN);
      expect(loggedLines[0]).not.toContain('rahasia');
      expect(loggedLines[0]).not.toContain('body.properties is not valid');
    });

    it('never puts the token or the board id in a thrown message', async () => {
      mockFetch.mockResolvedValue(buildResponse(401, { code: 'unauthorized' }));
      const client = new NotionHttpClient(buildConfig());
      const actualError = await client.createPage({ properties: {} }).catch((error) => error);
      expect((actualError as Error).message).not.toContain(TOKEN);
      expect((actualError as Error).message).not.toContain(DATA_SOURCE_ID);
    });
  });
});
