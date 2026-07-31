import { ConfigService } from '@nestjs/config';

import { AiChatbotError } from '../ai-chatbot.error';
import { AiProviderHttpClient } from './ai-provider-http.client';
import { AiProviderHttpRequest } from './ai-provider.types';

describe('AiProviderHttpClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function buildClient(env: Record<string, string> = {}): AiProviderHttpClient {
    return new AiProviderHttpClient(
      new ConfigService({ AI_PROVIDER_RETRY_BASE_DELAY_MS: '1', ...env }),
    );
  }

  function buildRequest(overrides: Partial<AiProviderHttpRequest> = {}): AiProviderHttpRequest {
    return {
      configId: 'config-1',
      url: 'https://api.example.test/v1/chat/completions',
      headers: { Authorization: 'Bearer sk-test' },
      body: { model: 'test-model' },
      timeoutMs: 5_000,
      ...overrides,
    };
  }

  function buildUnreachableError(): Error {
    return Object.assign(new Error('connect ECONNREFUSED'), { name: 'FetchError' });
  }

  function buildTimeoutError(): Error {
    return Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
  }

  it('returns the response with a measured latency and sends JSON headers', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const client = buildClient();

    const actualResult = await client.sendJsonRequest(buildRequest());

    expect(actualResult.response.status).toBe(200);
    expect(actualResult.latencyMs).toBeGreaterThanOrEqual(0);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((requestInit.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('retries once when the upstream is unreachable', async () => {
    fetchMock
      .mockRejectedValueOnce(buildUnreachableError())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = buildClient();

    const actualResult = await client.sendJsonRequest(buildRequest());

    expect(actualResult.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a timeout — the completion may already be processing', async () => {
    fetchMock.mockRejectedValue(buildTimeoutError());
    const client = buildClient();

    const actualError = await client.sendJsonRequest(buildRequest()).catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(AiChatbotError);
    expect((actualError as AiChatbotError).code).toBe('AI_PROVIDER_TIMEOUT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a delivered HTTP failure', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"boom"}', { status: 503 }));
    const client = buildClient();

    const actualResult = await client.sendJsonRequest(buildRequest());

    // Status handling is the adapter's job; the client only measures reach.
    expect(actualResult.response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated transport failures and reports it as unavailability', async () => {
    fetchMock.mockRejectedValue(buildUnreachableError());
    const client = buildClient({
      AI_PROVIDER_MAX_RETRY_ATTEMPTS: '0',
      AI_PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });

    await client.sendJsonRequest(buildRequest()).catch(() => undefined);
    await client.sendJsonRequest(buildRequest()).catch(() => undefined);
    const actualError = await client.sendJsonRequest(buildRequest()).catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((actualError as AiChatbotError).message).toContain('circuit breaker');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps circuits isolated per config id', async () => {
    fetchMock.mockRejectedValue(buildUnreachableError());
    const client = buildClient({
      AI_PROVIDER_MAX_RETRY_ATTEMPTS: '0',
      AI_PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });
    await client.sendJsonRequest(buildRequest({ configId: 'config-a' })).catch(() => undefined);
    await client.sendJsonRequest(buildRequest({ configId: 'config-a' })).catch(() => undefined);

    // config-a's circuit is open; config-b must still reach the network.
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const actualOther = await client.sendJsonRequest(buildRequest({ configId: 'config-b' }));

    expect(actualOther.response.status).toBe(200);
  });
});
