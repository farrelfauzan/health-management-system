import { RequestIdMiddleware } from './request-id.middleware';
import { NextHandler, ObservedRequest, ObservedResponse } from './observability.types';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  function buildRequest(incomingId?: string): ObservedRequest {
    return {
      method: 'GET',
      originalUrl: '/api/v1/health',
      header: jest.fn().mockReturnValue(incomingId),
    } as unknown as ObservedRequest;
  }

  function buildResponse(): ObservedResponse {
    return {
      statusCode: 200,
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
      on: jest.fn(),
    } as unknown as ObservedResponse;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('honors a well-formed incoming X-Request-Id header', () => {
    const inputRequest = buildRequest('client-supplied-id-01');
    const mockResponse = buildResponse();
    const mockNext: NextHandler = jest.fn();
    middleware.use(inputRequest, mockResponse, mockNext);
    expect(inputRequest.requestId).toBe('client-supplied-id-01');
    expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-supplied-id-01');
    expect(mockNext).toHaveBeenCalled();
  });

  it('generates a UUID when no header is provided', () => {
    const inputRequest = buildRequest(undefined);
    const mockResponse = buildResponse();
    middleware.use(inputRequest, mockResponse, jest.fn());
    expect(inputRequest.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('replaces a malformed incoming header with a generated id', () => {
    const inputRequest = buildRequest('bad id with spaces\n');
    const mockResponse = buildResponse();
    middleware.use(inputRequest, mockResponse, jest.fn());
    expect(inputRequest.requestId).not.toBe('bad id with spaces\n');
    expect(inputRequest.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
