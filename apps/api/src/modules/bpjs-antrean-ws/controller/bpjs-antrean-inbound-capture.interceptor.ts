import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

import { BpjsProtocolCaptureService } from '../../../common/bpjs-gateway/bpjs-protocol-capture.service';
import { BpjsAntreanInboundRequest } from '../guard/bpjs-antrean-inbound-request.type';

const SERVICE_LABEL = 'BPJS Antrean (inbound)';

type CapturedInboundRequest = BpjsAntreanInboundRequest & {
  readonly method?: string;
  readonly originalUrl?: string;
  readonly body?: unknown;
};

/**
 * Records the calls BPJS makes *into* the facility during UAT (P14-T06).
 *
 * The spike's fixture list asks for these explicitly — token issuance, and at
 * minimum one `ambil antrean` and one `pasien baru`, "captured as received",
 * because those are the write paths and their contracts (Q5) are entirely
 * unconfirmed. Until BPJS actually calls, HMS's inbound schemas are a reading
 * of a circulated document; one captured UAT session replaces that with the
 * real field names.
 *
 * Runs **after** the guard chain, deliberately. A refused request is refused
 * on evidence the audit trail already carries, and capturing unauthenticated
 * bodies from a public endpoint would turn a UAT instrument into a way to
 * write attacker-controlled content to the facility's disk.
 *
 * Like the outbound sink, this is a no-op unless `BPJS_PROTOCOL_CAPTURE_DIR`
 * is configured, and it never affects the response.
 */
@Injectable()
export class BpjsAntreanInboundCaptureInterceptor implements NestInterceptor {
  constructor(private readonly captureService: BpjsProtocolCaptureService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.captureService.isEnabled) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<CapturedInboundRequest>();
    return next.handle().pipe(
      tap((response) => {
        void this.captureService.record({
          service: SERVICE_LABEL,
          direction: 'INBOUND',
          method: request.method ?? 'POST',
          path: request.originalUrl ?? '',
          statusCode: context.switchToHttp().getResponse<{ statusCode?: number }>().statusCode ?? null,
          requestHeaders: this.readHeaders(request),
          requestBody: request.body,
          decodedResponse: response,
          outcome: 'ACCEPTED',
        });
      }),
    );
  }

  private readHeaders(request: CapturedInboundRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '');
    }
    return headers;
  }
}
