import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';

import { ObservedRequest, ObservedResponse } from '../../../common/observability/observability.types';
import {
  buildSafeErrorLog,
  stripQueryString,
} from '../../../common/observability/safe-logging';
import { AiChatbotError } from '../ai-chatbot.error';
import { AiChatbotErrorCode } from '../infrastructure/ai-provider.types';

/**
 * How each typed chatbot failure reaches the client. Chosen so the status
 * says who can fix it: **4xx when the caller can** (rephrase, slow down),
 * **5xx when only the clinic or the vendor can** — a patient cannot do
 * anything about an expired API key, so `AI_PROVIDER_UNAUTHORIZED` is a 502
 * rather than a 401 that would look like their own session expiring.
 */
const STATUS_BY_ERROR_CODE: Readonly<Record<AiChatbotErrorCode, number>> = {
  AI_SAFETY_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  AI_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  AI_PROVIDER_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  AI_PROVIDER_UNAUTHORIZED: HttpStatus.BAD_GATEWAY,
  AI_PROVIDER_MODEL_NOT_FOUND: HttpStatus.BAD_GATEWAY,
  AI_PROVIDER_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  // Both tool codes are model misbehaviour (an unoffered tool name, arguments
  // the schema rejects) — the chat user cannot fix either, so they are 502s
  // like every other upstream fault if the P15-T04 loop ever lets one surface.
  AI_TOOL_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  AI_TOOL_INVALID_ARGUMENTS: HttpStatus.BAD_GATEWAY,
  AI_TOOL_EXECUTION_FAILED: HttpStatus.BAD_GATEWAY,
};

/**
 * Shapes {@link AiChatbotError} into the HMS error envelope while keeping the
 * **typed code** rather than the status-derived label the global filter would
 * produce — §4.3.6 requires the client to branch on `AI_PROVIDER_TIMEOUT` and
 * friends, which a generic `BAD_GATEWAY` cannot express.
 *
 * Applied at the controller level rather than globally so its precedence over
 * the catch-all filter is explicit at the call site. Messages are the typed
 * ones raised by the service layer: they never carry prompts, credentials, or
 * provider payloads, and the 5xx log records only the code and request id.
 */
@Catch(AiChatbotError)
export class AiChatbotExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AiChatbotExceptionFilter.name);

  catch(exception: AiChatbotError, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<ObservedRequest>();
    const response = httpContext.getResponse<ObservedResponse>();
    const status = STATUS_BY_ERROR_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        buildSafeErrorLog('ai_chatbot_error', {
          requestId: request.requestId,
          method: request.method,
          path: stripQueryString(request.originalUrl),
          statusCode: status,
          errorCode: exception.code,
        }),
      );
    }
    response.status(status).json({
      error: {
        code: exception.code,
        message: exception.message,
      },
    });
  }
}
