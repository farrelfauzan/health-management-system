import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearFailedRequests,
  readFailedRequestIds,
  readFailedRequests,
  recordFailedRequest,
} from './failed-request-buffer';

describe('failed request buffer', () => {
  beforeEach(() => {
    clearFailedRequests();
  });

  it('remembers a failed request, newest first', () => {
    recordFailedRequest({ method: 'GET', status: 500, requestId: 'req-1' });
    recordFailedRequest({ method: 'POST', status: 400, requestId: 'req-2' });

    expect(readFailedRequestIds()).toEqual(['req-2', 'req-1']);
  });

  /**
   * The API refuses more than five, so keeping more would only mean the oldest
   * are dropped silently at submit rather than here.
   */
  it('keeps only the five most recent', () => {
    for (let index = 1; index <= 8; index += 1) {
      recordFailedRequest({ method: 'GET', status: 500, requestId: `req-${index}` });
    }

    expect(readFailedRequestIds()).toEqual(['req-8', 'req-7', 'req-6', 'req-5', 'req-4']);
  });

  /**
   * A response with no `X-Request-Id` points at no log line, so storing a blank
   * would spend one of five slots on nothing.
   */
  it('ignores a response that carried no request id', () => {
    recordFailedRequest({ method: 'GET', status: 502, requestId: '' });

    expect(readFailedRequestIds()).toEqual([]);
  });

  /**
   * The buffer travels inside a bug report that leaves the clinic, and a URL in
   * this product carries record ids and search terms. There is deliberately no
   * field for one.
   */
  it('has nowhere to put a URL', () => {
    recordFailedRequest({ method: 'GET', status: 500, requestId: 'req-1' });

    expect(Object.keys(readFailedRequests()[0] ?? {}).sort()).toEqual([
      'method',
      'requestId',
      'status',
    ]);
  });
});
