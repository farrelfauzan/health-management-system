import { createHmac } from 'node:crypto';

import { BpjsAntreanInboundTokenMaterial } from '../../../common/bpjs-antrean/bpjs-antrean.types';
import { BpjsAntreanConfigService } from '../../bpjs-antrean/service/bpjs-antrean-config.service';
import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundTokenService } from './bpjs-antrean-inbound-token.service';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';

const TOKEN_LIFETIME_SECONDS = 3_600;

function buildMaterial(seed: string): BpjsAntreanInboundTokenMaterial {
  return {
    signingKey: createHmac('sha256', 'test-key-label').update(seed).digest(),
    credentialFingerprint: createHmac('sha256', 'test-fingerprint-label')
      .update(seed)
      .digest('hex')
      .slice(0, 16),
  };
}

function buildService(params: {
  material: BpjsAntreanInboundTokenMaterial | null;
  isValid?: boolean;
}) {
  const mockConfigService = {
    getInboundTokenMaterial: jest.fn().mockResolvedValue(params.material),
    verifyInboundCredentials: jest.fn().mockResolvedValue(params.isValid ?? true),
  } as unknown as BpjsAntreanConfigService;
  const inboundConfig = { tokenLifetimeSeconds: TOKEN_LIFETIME_SECONDS } as BpjsAntreanInboundConfig;
  return {
    service: new BpjsAntreanInboundTokenService(mockConfigService, inboundConfig),
    mockConfigService,
  };
}

async function expectRejection(
  operation: Promise<unknown>,
  expectedReason: string,
): Promise<void> {
  await expect(operation).rejects.toThrow(BpjsAntreanInboundError);
  await operation.catch((caughtError: BpjsAntreanInboundError) => {
    expect(caughtError.reason).toBe(expectedReason);
    // Whatever went wrong, BPJS is told the same thing. The precise reason is
    // for the audit trail; a public endpoint that narrates which half of a
    // credential pair was wrong is a credential oracle.
    expect(caughtError.clientMessage).toBe('Unauthorized');
  });
}

describe('BpjsAntreanInboundTokenService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues a token that verifies', async () => {
    const { service } = buildService({ material: buildMaterial('password-hash-a') });

    const actualToken = await service.issueToken({ username: 'bpjs', password: 'secret' });

    await expect(service.verifyToken(actualToken)).resolves.toBeUndefined();
  });

  it('refuses to issue when the inbound credentials are not configured', async () => {
    // The normal state before UAT, and one of the two conditions that keep the
    // surface dark.
    const { service } = buildService({ material: null });

    await expectRejection(
      service.issueToken({ username: 'bpjs', password: 'secret' }),
      'CREDENTIALS_NOT_CONFIGURED',
    );
  });

  it('refuses to issue on a wrong credential pair', async () => {
    const { service } = buildService({
      material: buildMaterial('password-hash-a'),
      isValid: false,
    });

    await expectRejection(
      service.issueToken({ username: 'bpjs', password: 'wrong' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('rejects a token whose payload was edited', async () => {
    const { service } = buildService({ material: buildMaterial('password-hash-a') });
    const issuedToken = await service.issueToken({ username: 'bpjs', password: 'secret' });
    const [, signature] = issuedToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ aud: 'bpjs-antrean-inbound', iat: 0, exp: 9_999_999_999, cred: 'x' }),
      'utf8',
    ).toString('base64url');

    await expectRejection(service.verifyToken(`${forgedPayload}.${signature}`), 'INVALID_TOKEN');
  });

  it('rejects a structurally wrong token without throwing anything untyped', async () => {
    const { service } = buildService({ material: buildMaterial('password-hash-a') });

    await expectRejection(service.verifyToken('not-a-token'), 'INVALID_TOKEN');
    await expectRejection(service.verifyToken('a.b.c'), 'INVALID_TOKEN');
  });

  it('rejects a token past its lifetime', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { service } = buildService({ material: buildMaterial('password-hash-a') });
    const issuedToken = await service.issueToken({ username: 'bpjs', password: 'secret' });

    jest.setSystemTime(new Date('2026-08-01T01:00:01.000Z'));

    await expectRejection(service.verifyToken(issuedToken), 'EXPIRED_TOKEN');
  });

  it('invalidates outstanding tokens when the inbound password is rotated', async () => {
    // This is the revocation mechanism. There is no token table to purge, so
    // rotation has to be what ends a session — otherwise a leaked token would
    // outlive the credential it came from.
    const { service, mockConfigService } = buildService({
      material: buildMaterial('password-hash-a'),
    });
    const issuedToken = await service.issueToken({ username: 'bpjs', password: 'secret' });
    jest
      .mocked(mockConfigService.getInboundTokenMaterial)
      .mockResolvedValue(buildMaterial('password-hash-b'));

    await expectRejection(service.verifyToken(issuedToken), 'INVALID_TOKEN');
  });

  it('carries no HMS identity in its claims', async () => {
    // Possessing a token must never be widenable into a session, a role, or a
    // user. The claim set is the proof of that.
    const { service } = buildService({ material: buildMaterial('password-hash-a') });
    const issuedToken = await service.issueToken({ username: 'bpjs', password: 'secret' });
    const [payloadPart = ''] = issuedToken.split('.');

    const actualClaims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));

    expect(Object.keys(actualClaims).sort()).toEqual(['aud', 'cred', 'exp', 'iat']);
    expect(actualClaims.aud).toBe('bpjs-antrean-inbound');
  });
});
