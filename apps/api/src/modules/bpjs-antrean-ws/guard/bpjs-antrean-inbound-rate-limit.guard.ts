import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundRateLimiter } from '../service/bpjs-antrean-inbound-rate-limiter.service';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { BpjsAntreanInboundRequest } from './bpjs-antrean-inbound-request.type';
import {
  BPJS_ANTREAN_INBOUND_SERVICE_KEY,
  BpjsAntreanInboundRateClass,
  BpjsAntreanInboundServiceMetadata,
} from './inbound-service.decorator';

const TOO_MANY_REQUESTS_META_CODE = 429;

/**
 * Per-endpoint rate limiting (P14-T04), second in the guard chain.
 *
 * It runs after the source-IP check so a caller who is not BPJS cannot make
 * HMS spend memory on a counter, and before the token check so a
 * credential-guessing loop is throttled before it reaches bcrypt — which is
 * the expensive half, and therefore the half worth protecting.
 *
 * Counted per (service, source address) rather than per service alone: BPJS
 * legitimately calls from several addresses, and one of them being noisy must
 * not lock the clinic out of Mobile JKN entirely.
 */
@Injectable()
export class BpjsAntreanInboundRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimiter: BpjsAntreanInboundRateLimiter,
    private readonly inboundConfig: BpjsAntreanInboundConfig,
    private readonly reflector: Reflector,
    private readonly auditService: BpjsAntreanInboundAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BpjsAntreanInboundRequest>();
    const metadata = this.reflector.get<BpjsAntreanInboundServiceMetadata | undefined>(
      BPJS_ANTREAN_INBOUND_SERVICE_KEY,
      context.getHandler(),
    );
    const service = metadata?.service ?? 'TOKEN';
    const sourceIp = request.bpjsAntreanSourceIp ?? null;
    const isWithinBudget = this.rateLimiter.tryConsume({
      key: `${service}|${sourceIp ?? 'unknown'}`,
      limitPerMinute: this.resolveLimit(metadata?.rateClass ?? 'TOKEN'),
    });
    if (!isWithinBudget) {
      await this.auditService.recordRejected({ service, reason: 'RATE_LIMITED', sourceIp });
      throw new BpjsAntreanInboundError(
        'RATE_LIMITED',
        TOO_MANY_REQUESTS_META_CODE,
        'Too many requests',
      );
    }
    return true;
  }

  private resolveLimit(rateClass: BpjsAntreanInboundRateClass): number {
    if (rateClass === 'WRITE') {
      return this.inboundConfig.writeRequestsPerMinute;
    }
    if (rateClass === 'READ') {
      return this.inboundConfig.readRequestsPerMinute;
    }
    return this.inboundConfig.tokenRequestsPerMinute;
  }
}
