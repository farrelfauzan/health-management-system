import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BpjsAntreanInboundService } from '@hms/shared-types';

import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { isIpAllowed } from '../service/is-ip-allowed';
import { resolveRequestSourceIp } from '../service/resolve-request-source-ip';
import { BpjsAntreanInboundRequest } from './bpjs-antrean-inbound-request.type';
import {
  BPJS_ANTREAN_INBOUND_SERVICE_KEY,
  BpjsAntreanInboundServiceMetadata,
} from './inbound-service.decorator';

const FORBIDDEN_META_CODE = 403;
const SERVICE_UNAVAILABLE_META_CODE = 503;

/**
 * The first gate on the inbound Antrean surface (P14-T04), and the one that
 * decides whether the surface is reachable at all.
 *
 * It runs **before** the token guard, deliberately. A token check is a
 * credential oracle: run it for arbitrary callers and anyone on the internet
 * can probe tokens against the facility. Refusing by source address first
 * means only BPJS's published ranges ever get to try (spike question Q6).
 *
 * With no allowlist configured the guard refuses everything. That is what
 * keeps this module dark on every deployment that has not been told where
 * BPJS calls from — which, until UAT, is all of them.
 */
@Injectable()
export class BpjsAntreanSourceIpGuard implements CanActivate {
  constructor(
    private readonly inboundConfig: BpjsAntreanInboundConfig,
    private readonly reflector: Reflector,
    private readonly auditService: BpjsAntreanInboundAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BpjsAntreanInboundRequest>();
    const sourceIp = resolveRequestSourceIp(request, this.inboundConfig.trustedProxyHopCount);
    request.bpjsAntreanSourceIp = sourceIp;
    const service = this.resolveService(context);
    if (!this.inboundConfig.isEnabled) {
      await this.auditService.recordRejected({ service, reason: 'SURFACE_DISABLED', sourceIp });
      throw new BpjsAntreanInboundError(
        'SURFACE_DISABLED',
        SERVICE_UNAVAILABLE_META_CODE,
        'Service unavailable',
      );
    }
    if (sourceIp === null || !isIpAllowed(sourceIp, this.inboundConfig.allowedSourceRanges)) {
      await this.auditService.recordRejected({
        service,
        reason: 'SOURCE_IP_NOT_ALLOWED',
        sourceIp,
      });
      throw new BpjsAntreanInboundError('SOURCE_IP_NOT_ALLOWED', FORBIDDEN_META_CODE, 'Forbidden');
    }
    return true;
  }

  private resolveService(context: ExecutionContext): BpjsAntreanInboundService {
    const metadata = this.reflector.get<BpjsAntreanInboundServiceMetadata | undefined>(
      BPJS_ANTREAN_INBOUND_SERVICE_KEY,
      context.getHandler(),
    );
    // An undeclared handler is a bug, not a route to guess at. `TOKEN` is the
    // narrowest budget and the least privileged label, so mislabelling fails
    // toward refusal rather than toward permission.
    return metadata?.service ?? 'TOKEN';
  }
}
