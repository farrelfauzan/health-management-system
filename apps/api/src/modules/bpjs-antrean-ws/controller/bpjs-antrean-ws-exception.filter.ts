import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { AntreanEnvelope } from '@hms/shared-types';

import { ObservedRequest, ObservedResponse } from '../../../common/observability/observability.types';
import { buildSafeErrorLog, stripQueryString } from '../../../common/observability/safe-logging';
import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanServiceError } from '../bpjs-antrean-service.error';

const GENERIC_FAILURE_MESSAGE = 'Terjadi kesalahan pada sistem fasilitas kesehatan';

/**
 * Turns every failure on the inbound surface into **BPJS's** envelope
 * (P14-T04).
 *
 * This filter catches everything, deliberately. The HMS error envelope is
 * `{ error: { code, message } }` and BPJS's client cannot read it — so an
 * uncaught `ConflictException` from a domain service, or a genuine bug, must
 * not be allowed to leak a shape the caller will treat as a transport failure.
 * Whatever goes wrong, BPJS gets `metaData` and a null `response`.
 *
 * The HTTP status is always 200. That is not sloppiness: the antrean protocol
 * carries the outcome in `metaData.code`, and the reference clients read that
 * field rather than the status line. A 500 status with a well-formed body is
 * the one combination guaranteed to be misread at UAT.
 *
 * Unexpected failures are logged with the request id and **replaced** with a
 * generic Indonesian message. A stack trace or a Prisma error string reaching
 * a public endpoint would describe the clinic's schema to anyone who can
 * reach the host.
 */
@Catch()
export class BpjsAntreanWsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BpjsAntreanWsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<ObservedResponse>();
    response.status(HttpStatus.OK).json(this.buildEnvelope(exception, httpContext.getRequest()));
  }

  private buildEnvelope(exception: unknown, request: ObservedRequest): AntreanEnvelope<never> {
    if (exception instanceof BpjsAntreanInboundError) {
      return this.toEnvelope(exception.metaDataCode, exception.clientMessage);
    }
    if (exception instanceof BpjsAntreanServiceError) {
      return this.toEnvelope(exception.metaDataCode, exception.message);
    }
    if (exception instanceof HttpException && exception.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR) {
      // A 4xx from a domain service or the validation pipe: the caller sent
      // something HMS cannot act on. The status carries the meaning; the
      // message does not, because a domain message is written for clinic staff
      // and may name internal fields.
      return this.toEnvelope(exception.getStatus(), 'Permintaan tidak dapat diproses');
    }
    this.logUnexpected(exception, request);
    return this.toEnvelope(HttpStatus.INTERNAL_SERVER_ERROR, GENERIC_FAILURE_MESSAGE);
  }

  private logUnexpected(exception: unknown, request: ObservedRequest): void {
    this.logger.error(
      buildSafeErrorLog('bpjs_antrean_inbound_error', {
        requestId: request.requestId,
        method: request.method,
        path: stripQueryString(request.originalUrl),
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
      }),
    );
  }

  private toEnvelope(code: number, message: string): AntreanEnvelope<never> {
    return { metaData: { code, message }, response: null };
  }
}
