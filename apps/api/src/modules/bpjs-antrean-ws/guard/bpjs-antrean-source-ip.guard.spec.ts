import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { BpjsAntreanSourceIpGuard } from './bpjs-antrean-source-ip.guard';
import { BpjsAntreanInboundRequest } from './bpjs-antrean-inbound-request.type';

function buildContext(request: BpjsAntreanInboundRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
  } as unknown as ExecutionContext;
}

function buildGuard(allowedIps?: string) {
  const configService = {
    get: (key: string) => (key === 'BPJS_ANTREAN_INBOUND_ALLOWED_IPS' ? allowedIps : undefined),
  } as unknown as ConfigService;
  const mockAuditService = {
    recordRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as BpjsAntreanInboundAuditService;
  const reflector = { get: () => ({ service: 'AMBIL_ANTREAN', rateClass: 'WRITE' }) } as unknown as Reflector;
  return {
    guard: new BpjsAntreanSourceIpGuard(
      new BpjsAntreanInboundConfig(configService),
      reflector,
      mockAuditService,
    ),
    mockAuditService,
  };
}

describe('BpjsAntreanSourceIpGuard', () => {
  it('refuses every request while no allowlist is configured', async () => {
    const { guard, mockAuditService } = buildGuard();
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: {},
      socket: { remoteAddress: '203.0.113.7' },
    };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toThrow(
      BpjsAntreanInboundError,
    );
    expect(mockAuditService.recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'SURFACE_DISABLED' }),
    );
  });

  it('admits a source inside the allowlist', async () => {
    const { guard } = buildGuard('203.0.113.0/24');
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: {},
      socket: { remoteAddress: '203.0.113.7' },
    };

    await expect(guard.canActivate(buildContext(inputRequest))).resolves.toBe(true);
  });

  it('refuses and audits a source outside the allowlist', async () => {
    const { guard, mockAuditService } = buildGuard('203.0.113.0/24');
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: {},
      socket: { remoteAddress: '198.51.100.9' },
    };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toMatchObject({
      reason: 'SOURCE_IP_NOT_ALLOWED',
      clientMessage: 'Forbidden',
    });
    expect(mockAuditService.recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'SOURCE_IP_NOT_ALLOWED', sourceIp: '198.51.100.9' }),
    );
  });

  it('ignores a spoofed X-Forwarded-For when no proxy hop is trusted', async () => {
    // Without this, anyone could reach the write endpoints by claiming to be
    // BPJS in a header they control.
    const { guard } = buildGuard('203.0.113.0/24');
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: { 'x-forwarded-for': '203.0.113.7' },
      socket: { remoteAddress: '198.51.100.9' },
    };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toMatchObject({
      reason: 'SOURCE_IP_NOT_ALLOWED',
    });
  });

  it('stamps the resolved address on the request for the later guards and the audit trail', async () => {
    const { guard } = buildGuard('203.0.113.0/24');
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: {},
      socket: { remoteAddress: '203.0.113.7' },
    };

    await guard.canActivate(buildContext(inputRequest));

    expect(inputRequest.bpjsAntreanSourceIp).toBe('203.0.113.7');
  });
});
