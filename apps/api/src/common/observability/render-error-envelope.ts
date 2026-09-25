import { ArgumentsHost } from '@nestjs/common';
import { ApiError } from '@hms/shared-types';

import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Runs an exception through the real global filter and returns what the client
 * would receive. For specs: asserting on `getResponse()` proves only what the
 * thrower built, and a body the filter cannot read — one nested under its own
 * `error` key — passes that assertion while the client gets "Http Exception"
 * and a bare status code.
 */
export function renderErrorEnvelope(exception: unknown): { status: number; body: ApiError } {
  const rendered: { status: number; body: ApiError | null } = { status: 0, body: null };
  const response = {
    status: (status: number) => {
      rendered.status = status;
      return response;
    },
    json: (body: ApiError) => {
      rendered.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'spec', method: 'GET', originalUrl: '/spec' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  if (rendered.body === null) {
    throw new Error('The exception filter wrote no body');
  }
  return { status: rendered.status, body: rendered.body };
}
