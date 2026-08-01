import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BpjsAntreanInboundService } from '@hms/shared-types';

import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundTokenService } from '../service/bpjs-antrean-inbound-token.service';
import { BpjsAntreanInboundRequest } from './bpjs-antrean-inbound-request.type';
import {
  BPJS_ANTREAN_INBOUND_SERVICE_KEY,
  BpjsAntreanInboundServiceMetadata,
} from './inbound-service.decorator';

const UNAUTHORIZED_META_CODE = 401;
const TOKEN_HEADER = 'x-token';

/**
 * The purpose-built token guard for the inbound Antrean surface (P14-T04).
 *
 * **Never `JwtAuthGuard`.** The two schemes protect different things: HMS's
 * JWT proves a person signed in and carries their roles, while this token
 * proves only that the caller presented the credential pair BPJS agreed at
 * UAT. Reusing the JWT guard would either hand BPJS an HMS identity or
 * require a bypass inside the guard every other route depends on — both are
 * worse than a second, smaller guard that can only ever say yes to one thing.
 *
 * The header the token rides on is spike question Q4 and is unconfirmed:
 * `X-token` is what the FKTP reference implementations use. If BPJS presents
 * it differently, {@link TOKEN_HEADER} is the line that changes.
 */
@Injectable()
export class BpjsAntreanInboundTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: BpjsAntreanInboundTokenService,
    private readonly reflector: Reflector,
    private readonly auditService: BpjsAntreanInboundAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BpjsAntreanInboundRequest>();
    const service = this.resolveService(context);
    const sourceIp = request.bpjsAntreanSourceIp ?? null;
    const presentedToken = this.readToken(request);
    if (presentedToken === null) {
      await this.auditService.recordRejected({ service, reason: 'MISSING_TOKEN', sourceIp });
      throw new BpjsAntreanInboundError('MISSING_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
    try {
      await this.tokenService.verifyToken(presentedToken);
    } catch (caughtError) {
      await this.recordVerificationFailure(caughtError, service, sourceIp);
      throw caughtError;
    }
    return true;
  }

  private async recordVerificationFailure(
    caughtError: unknown,
    service: BpjsAntreanInboundService,
    sourceIp: string | null,
  ): Promise<void> {
    if (!(caughtError instanceof BpjsAntreanInboundError)) {
      return;
    }
    await this.auditService.recordRejected({ service, reason: caughtError.reason, sourceIp });
  }

  private readToken(request: BpjsAntreanInboundRequest): string | null {
    const rawHeader = request.headers[TOKEN_HEADER];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (headerValue === undefined || headerValue.trim() === '') {
      return null;
    }
    return headerValue.trim();
  }

  private resolveService(context: ExecutionContext): BpjsAntreanInboundService {
    const metadata = this.reflector.get<BpjsAntreanInboundServiceMetadata | undefined>(
      BPJS_ANTREAN_INBOUND_SERVICE_KEY,
      context.getHandler(),
    );
    return metadata?.service ?? 'TOKEN';
  }
}
