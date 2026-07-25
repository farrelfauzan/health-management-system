import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ObservedRequest, ObservedResponse } from './observability.types';

const ERROR_CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

type HttpExceptionBody = {
  readonly message?: string | readonly string[];
  readonly errors?: unknown;
};

type ResolvedErrorContent = {
  readonly message: string;
  readonly details?: unknown;
};

/**
 * Shapes every error response into the documented HMS envelope
 * ({ error: { code, message, details? } }) and logs unexpected 5xx failures
 * with their request correlation id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<ObservedRequest>();
    const response = httpContext.getResponse<ObservedResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const { message, details } = resolveErrorContent(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        JSON.stringify({
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: status,
          message: exception instanceof Error ? exception.message : String(exception),
        }),
        stack,
      );
    }
    response.status(status).json({
      error: {
        code: ERROR_CODE_BY_STATUS[status] ?? 'INTERNAL_SERVER_ERROR',
        message,
        ...(details === undefined ? {} : { details }),
      },
    });
  }
}

function resolveErrorContent(exception: unknown): ResolvedErrorContent {
  if (!(exception instanceof HttpException)) {
    return { message: 'Internal server error' };
  }
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return { message: body };
  }
  const { message, errors } = body as HttpExceptionBody;
  const resolvedMessage = Array.isArray(message)
    ? message.join('; ')
    : ((message as string | undefined) ?? exception.message);
  return { message: resolvedMessage, details: errors };
}
