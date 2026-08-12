import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The signing and verification keys for the access token (SJ-5).
 *
 * Only the access token is a JWT. SJ-6 made refresh tokens opaque random
 * strings checked against a hash in the database, so there is no refresh
 * signing key to rotate — and no `JWT_REFRESH_SECRET`.
 *
 * Rotation without mass logout is the whole point. A single-key deployment
 * cannot change its JWT secret without invalidating every access token in
 * flight — which, for a clinic, means every logged-in workstation failing its
 * next request. So there is one *signing* key and an ordered list of
 * *verification* keys:
 *
 *   1. add the new key as `JWT_ACCESS_SECRET`, move the old one to
 *      `JWT_ACCESS_SECRET_PREVIOUS`, restart — new tokens are signed with the
 *      new key, existing ones still verify;
 *   2. wait one refresh-token lifetime, so nothing signed with the old key can
 *      still be presented;
 *   3. clear `JWT_ACCESS_SECRET_PREVIOUS` and restart.
 *
 * `*_PREVIOUS` is comma-separated so an interrupted rotation can be resumed
 * rather than unwound. Order matters: verification tries the signing key
 * first, because in the steady state that is the one that will match.
 *
 * There is no fallback anywhere in this file. A missing secret is caught at
 * boot by `validateEnvironment`; if one is somehow absent here, the getter
 * throws rather than inventing a key.
 */
@Injectable()
export class JwtSecretsService {
  constructor(private readonly configService: ConfigService) {}

  getAccessSigningSecret(): string {
    return this.readRequiredSecret('JWT_ACCESS_SECRET');
  }

  getAccessVerificationSecrets(): string[] {
    return this.buildVerificationSecrets('JWT_ACCESS_SECRET');
  }

  private buildVerificationSecrets(key: string): string[] {
    const previous = this.configService.get<string>(`${key}_PREVIOUS`) ?? '';
    const retired = previous
      .split(',')
      .map((secret) => secret.trim())
      .filter((secret) => secret.length > 0);
    return [...new Set([this.readRequiredSecret(key), ...retired])];
  }

  private readRequiredSecret(key: string): string {
    const secret = this.configService.get<string>(key);
    if (!secret) {
      throw new Error(`${key} is not configured`);
    }
    return secret;
  }
}
