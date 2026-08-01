import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { BpjsAntreanInboundTokenClaims } from '@hms/shared-types';

import { BpjsAntreanInboundTokenMaterial } from '../../../common/bpjs-antrean/bpjs-antrean.types';
import { BpjsAntreanConfigService } from '../../bpjs-antrean/service/bpjs-antrean-config.service';
import { BpjsAntreanInboundError } from '../bpjs-antrean-ws.error';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';

const TOKEN_AUDIENCE = 'bpjs-antrean-inbound';
const SECONDS_PER_MILLISECOND = 1_000;
const UNAUTHORIZED_META_CODE = 401;

/**
 * Issues and verifies the short-lived token BPJS carries on inbound calls
 * (spike question Q4).
 *
 * **Stateless by design.** The token is a signed claim set, not a row: there
 * is no token table, no cleanup job, and no window in which a revoked
 * credential still has live sessions. Rotation is the revocation mechanism —
 * the signing key and the `cred` fingerprint both derive from the stored
 * password hash, so changing the inbound password makes every outstanding
 * token fail signature *and* fingerprint at once.
 *
 * The claims carry **no HMS identity**. Authorisation comes from the reserved
 * system actor the module resolves server-side, so possessing a token can
 * never be widened into a session, a role, or a user.
 *
 * Every detail below — the header the token rides on, its encoding, its
 * lifetime, and what BPJS does when it expires mid-session — is Q4 and is
 * unconfirmed. What is *not* a hypothesis is the shape of the guarantee: a
 * forged or expired token is rejected without touching a domain service.
 */
@Injectable()
export class BpjsAntreanInboundTokenService {
  constructor(
    private readonly configService: BpjsAntreanConfigService,
    private readonly inboundConfig: BpjsAntreanInboundConfig,
  ) {}

  /**
   * Exchanges the agreed username/password for a token. Throws a coarse
   * `INVALID_CREDENTIALS` for every failure mode the caller could probe, and
   * a distinct `CREDENTIALS_NOT_CONFIGURED` only into the audit trail — both
   * reach BPJS as the same 401.
   */
  async issueToken(params: { username: string; password: string }): Promise<string> {
    const material = await this.configService.getInboundTokenMaterial();
    if (material === null) {
      throw new BpjsAntreanInboundError(
        'CREDENTIALS_NOT_CONFIGURED',
        UNAUTHORIZED_META_CODE,
        'Unauthorized',
      );
    }
    const isValid = await this.configService.verifyInboundCredentials(params);
    if (!isValid) {
      throw new BpjsAntreanInboundError(
        'INVALID_CREDENTIALS',
        UNAUTHORIZED_META_CODE,
        'Unauthorized',
      );
    }
    return this.signClaims(this.buildClaims(material), material);
  }

  /**
   * Verifies a presented token. Signature is checked **before** expiry so a
   * forged token cannot be distinguished from an expired one by response
   * timing, and the credential fingerprint is checked after both so a token
   * signed under a rotated password is refused even if it is still in date.
   */
  async verifyToken(presentedToken: string): Promise<void> {
    const material = await this.configService.getInboundTokenMaterial();
    if (material === null) {
      throw new BpjsAntreanInboundError(
        'CREDENTIALS_NOT_CONFIGURED',
        UNAUTHORIZED_META_CODE,
        'Unauthorized',
      );
    }
    const claims = this.readVerifiedClaims(presentedToken, material);
    if (claims.exp <= this.nowInSeconds()) {
      throw new BpjsAntreanInboundError('EXPIRED_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
    if (claims.aud !== TOKEN_AUDIENCE || claims.cred !== material.credentialFingerprint) {
      throw new BpjsAntreanInboundError('INVALID_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
  }

  private readVerifiedClaims(
    presentedToken: string,
    material: BpjsAntreanInboundTokenMaterial,
  ): BpjsAntreanInboundTokenClaims {
    const [payloadPart, signaturePart, ...rest] = presentedToken.split('.');
    if (payloadPart === undefined || signaturePart === undefined || rest.length > 0) {
      throw new BpjsAntreanInboundError('INVALID_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
    if (!this.hasValidSignature(payloadPart, signaturePart, material)) {
      throw new BpjsAntreanInboundError('INVALID_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
    return this.decodeClaims(payloadPart);
  }

  private decodeClaims(payloadPart: string): BpjsAntreanInboundTokenClaims {
    try {
      return JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf8'),
      ) as BpjsAntreanInboundTokenClaims;
    } catch {
      throw new BpjsAntreanInboundError('INVALID_TOKEN', UNAUTHORIZED_META_CODE, 'Unauthorized');
    }
  }

  private hasValidSignature(
    payloadPart: string,
    signaturePart: string,
    material: BpjsAntreanInboundTokenMaterial,
  ): boolean {
    const expected = this.signPayload(payloadPart, material);
    const presentedBytes = Buffer.from(signaturePart, 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    if (presentedBytes.length !== expectedBytes.length) {
      return false;
    }
    return timingSafeEqual(presentedBytes, expectedBytes);
  }

  private buildClaims(
    material: BpjsAntreanInboundTokenMaterial,
  ): BpjsAntreanInboundTokenClaims {
    const issuedAt = this.nowInSeconds();
    return {
      aud: TOKEN_AUDIENCE,
      iat: issuedAt,
      exp: issuedAt + this.inboundConfig.tokenLifetimeSeconds,
      cred: material.credentialFingerprint,
    };
  }

  private signClaims(
    claims: BpjsAntreanInboundTokenClaims,
    material: BpjsAntreanInboundTokenMaterial,
  ): string {
    const payloadPart = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    return `${payloadPart}.${this.signPayload(payloadPart, material)}`;
  }

  private signPayload(payloadPart: string, material: BpjsAntreanInboundTokenMaterial): string {
    return createHmac('sha256', material.signingKey).update(payloadPart).digest('base64url');
  }

  private nowInSeconds(): number {
    return Math.floor(Date.now() / SECONDS_PER_MILLISECOND);
  }
}
