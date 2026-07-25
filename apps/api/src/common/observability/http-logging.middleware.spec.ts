import { Logger } from '@nestjs/common';

import { HttpLoggingMiddleware } from './http-logging.middleware';
import { NextHandler, ObservedRequest, ObservedResponse } from './observability.types';

describe('HttpLoggingMiddleware', () => {
  const middleware = new HttpLoggingMiddleware();

  function buildRequest(): ObservedRequest {
    return {
      requestId: 'req-123',
      method: 'GET',
      originalUrl: '/api/v1/patients',
      user: { sub: 'user-1', email: 'admin@example.com' },
      header: jest.fn(),
    } as unknown as ObservedRequest;
  }

  function buildResponse(statusCode: number): {
    response: ObservedResponse;
    emitFinish: () => void;
  } {
    let finishListener: (() => void) | undefined;
    const response = {
      statusCode,
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
      on: jest.fn((_event: string, listener: () => void) => {
        finishListener = listener;
      }),
    } as unknown as ObservedResponse;
    return { response, emitFinish: () => finishListener?.() };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a structured access line with request context on finish', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const { response, emitFinish } = buildResponse(200);
    const mockNext: NextHandler = jest.fn();
    middleware.use(buildRequest(), response, mockNext);
    emitFinish();
    expect(mockNext).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const actualEntry = JSON.parse(
      (logSpy.mock.calls[0]?.[0] ?? '{}') as string,
    ) as Record<string, unknown>;
    expect(actualEntry).toMatchObject({
      requestId: 'req-123',
      method: 'GET',
      path: '/api/v1/patients',
      statusCode: 200,
      userId: 'user-1',
    });
    expect(typeof actualEntry.durationMs).toBe('number');
  });

  it('logs 4xx responses at warn level and 5xx at error level', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const clientError = buildResponse(404);
    middleware.use(buildRequest(), clientError.response, jest.fn());
    clientError.emitFinish();
    const serverError = buildResponse(500);
    middleware.use(buildRequest(), serverError.response, jest.fn());
    serverError.emitFinish();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
