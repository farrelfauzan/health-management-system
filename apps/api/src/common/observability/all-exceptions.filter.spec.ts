import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';

import { loginSchema } from '@hms/shared-types';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { ObservedResponse } from './observability.types';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  function buildHost(): { host: ArgumentsHost; response: ObservedResponse } {
    const response = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      on: jest.fn(),
      status: jest.fn(),
    } as unknown as ObservedResponse;
    (response.status as jest.Mock).mockReturnValue(response);
    const request = {
      requestId: 'req-123',
      method: 'GET',
      originalUrl: '/api/v1/patients/unknown',
      header: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { host, response };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shapes an HttpException into the documented error envelope', () => {
    const { host, response } = buildHost();
    filter.catch(new NotFoundException('Patient not found'), host);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'Patient not found',
      },
    });
  });

  it('includes zod issues as details for validation failures', () => {
    const { host, response } = buildHost();
    const parseResult = loginSchema.safeParse({ email: 'not-an-email', password: '' });
    if (parseResult.success) {
      throw new Error('Expected schema parse to fail');
    }
    filter.catch(new ZodValidationException(parseResult.error), host);
    expect(response.status).toHaveBeenCalledWith(400);
    const actualBody = (response.json as jest.Mock).mock.calls[0]?.[0] as {
      error: { code: string; message: string; details?: unknown };
    };
    expect(actualBody.error.code).toBe('BAD_REQUEST');
    expect(actualBody.error.message).toBe('Validation failed');
    expect(Array.isArray(actualBody.error.details)).toBe(true);
  });

  it('masks unexpected errors as internal server error and logs them', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, response } = buildHost();
    filter.catch(new Error('database exploded'), host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const actualLog = JSON.parse(
      (errorSpy.mock.calls[0]?.[0] ?? '{}') as string,
    ) as Record<string, unknown>;
    expect(actualLog).toMatchObject({
      requestId: 'req-123',
      statusCode: 500,
      message: 'database exploded',
    });
  });
});
