import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundTokenService } from '../service/bpjs-antrean-inbound-token.service';
import { BpjsAntreanInboundRequest } from './bpjs-antrean-inbound-request.type';
import { BpjsAntreanInboundTokenGuard } from './bpjs-antrean-inbound-token.guard';

function buildContext(request: BpjsAntreanInboundRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
  } as unknown as ExecutionContext;
}

function buildGuard(verifyImplementation: () => Promise<void>) {
  const mockTokenService = {
    verifyToken: jest.fn().mockImplementation(verifyImplementation),
  } as unknown as BpjsAntreanInboundTokenService;
  const mockAuditService = {
    recordRejected: jest.fn().mockResolvedValue(undefined),
  } as unknown as BpjsAntreanInboundAuditService;
  const reflector = {
    get: () => ({ service: 'SISA_ANTREAN', rateClass: 'READ' }),
  } as unknown as Reflector;
  return {
    guard: new BpjsAntreanInboundTokenGuard(mockTokenService, reflector, mockAuditService),
    mockTokenService,
    mockAuditService,
  };
}

describe('BpjsAntreanInboundTokenGuard', () => {
  it('admits a request carrying a valid token', async () => {
    const { guard, mockTokenService } = buildGuard(() => Promise.resolve());
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: { 'x-token': 'a-valid-token' },
      bpjsAntreanSourceIp: '203.0.113.7',
    };

    await expect(guard.canActivate(buildContext(inputRequest))).resolves.toBe(true);
    expect(mockTokenService.verifyToken).toHaveBeenCalledWith('a-valid-token');
  });

  it('refuses and audits a request with no token', async () => {
    const { guard, mockTokenService, mockAuditService } = buildGuard(() => Promise.resolve());
    const inputRequest: BpjsAntreanInboundRequest = { headers: {} };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toMatchObject({
      reason: 'MISSING_TOKEN',
      clientMessage: 'Unauthorized',
    });
    // The token service is never reached, so a tokenless flood costs no bcrypt.
    expect(mockTokenService.verifyToken).not.toHaveBeenCalled();
    expect(mockAuditService.recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'MISSING_TOKEN', service: 'SISA_ANTREAN' }),
    );
  });

  it('audits the precise verification failure while telling the caller nothing', async () => {
    const { guard, mockAuditService } = buildGuard(() =>
      Promise.reject(new BpjsAntreanInboundError('EXPIRED_TOKEN', 401, 'Unauthorized')),
    );
    const inputRequest: BpjsAntreanInboundRequest = {
      headers: { 'x-token': 'an-expired-token' },
      bpjsAntreanSourceIp: '203.0.113.7',
    };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toMatchObject({
      clientMessage: 'Unauthorized',
    });
    expect(mockAuditService.recordRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'EXPIRED_TOKEN' }),
    );
  });

  it('treats a blank token header as missing', async () => {
    const { guard } = buildGuard(() => Promise.resolve());
    const inputRequest: BpjsAntreanInboundRequest = { headers: { 'x-token': '   ' } };

    await expect(guard.canActivate(buildContext(inputRequest))).rejects.toMatchObject({
      reason: 'MISSING_TOKEN',
    });
  });
});
