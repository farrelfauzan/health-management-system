import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtSecretsService } from './jwt-secrets.service';
import { verifyWithAnySecret } from './verify-with-any-secret';

const OLD_SECRET = 'the-key-in-use-before-the-rotation';
const NEW_SECRET = 'the-key-issued-during-the-rotation';

type SessionClaims = { sub: string };

/**
 * SJ-5's acceptance criterion, as a test: a JWT key rotation must not
 * invalidate active sessions. The three steps below are the documented
 * procedure in `docs/security/secrets.md`, and each asserts what a signed-in
 * clinic workstation would experience at that moment.
 */
describe('JWT key rotation', () => {
  const jwtService = new JwtService();

  /** See jwt-secrets.service.spec.ts — isolated from ambient process.env. */
  function buildSecrets(env: Record<string, string>): JwtSecretsService {
    return new JwtSecretsService({
      get: (key: string): string | undefined => env[key],
    } as unknown as ConfigService);
  }

  async function signWith(secret: string): Promise<string> {
    return jwtService.signAsync({ sub: 'user-1' }, { secret, expiresIn: '15m' });
  }

  async function verify(token: string, secrets: JwtSecretsService): Promise<SessionClaims> {
    return verifyWithAnySecret<SessionClaims>(
      jwtService,
      token,
      secrets.getAccessVerificationSecrets(),
    );
  }

  it('step 1 — before rotating, a token signed with the only key verifies', async () => {
    const inputSecrets = buildSecrets({
      JWT_ACCESS_SECRET: OLD_SECRET,
    });
    const existingToken = await signWith(OLD_SECRET);

    await expect(verify(existingToken, inputSecrets)).resolves.toMatchObject({ sub: 'user-1' });
  });

  it('step 2 — with the old key retired but retained, the existing session survives', async () => {
    const inputSecrets = buildSecrets({
      JWT_ACCESS_SECRET: NEW_SECRET,
      JWT_ACCESS_SECRET_PREVIOUS: OLD_SECRET,
    });
    const existingToken = await signWith(OLD_SECRET);
    const freshToken = await signWith(NEW_SECRET);

    await expect(verify(existingToken, inputSecrets)).resolves.toMatchObject({ sub: 'user-1' });
    await expect(verify(freshToken, inputSecrets)).resolves.toMatchObject({ sub: 'user-1' });
  });

  it('step 3 — once the old key is dropped, tokens signed with it are refused', async () => {
    const inputSecrets = buildSecrets({
      JWT_ACCESS_SECRET: NEW_SECRET,
    });
    const existingToken = await signWith(OLD_SECRET);

    await expect(verify(existingToken, inputSecrets)).rejects.toThrow();
  });

  it('signs new tokens with the new key from the moment it is installed', async () => {
    const inputSecrets = buildSecrets({
      JWT_ACCESS_SECRET: NEW_SECRET,
      JWT_ACCESS_SECRET_PREVIOUS: OLD_SECRET,
    });

    const signedToken = await signWith(inputSecrets.getAccessSigningSecret());

    // Verifiable under the new key alone — so a later step-3 restart, which
    // drops the old key, does not strand tokens minted during the window.
    await expect(
      verifyWithAnySecret<SessionClaims>(jwtService, signedToken, [NEW_SECRET]),
    ).resolves.toMatchObject({ sub: 'user-1' });
  });

  describe('verifyWithAnySecret', () => {
    it('rejects a token signed with a key that was never in the list', async () => {
      const forgedToken = await signWith('a-key-this-deployment-never-had');

      await expect(
        verifyWithAnySecret<SessionClaims>(jwtService, forgedToken, [NEW_SECRET, OLD_SECRET]),
      ).rejects.toThrow();
    });

    it('surfaces a genuine JWT error rather than a synthesised one', async () => {
      const expiredToken = await jwtService.signAsync(
        { sub: 'user-1' },
        { secret: NEW_SECRET, expiresIn: '-1s' },
      );

      await expect(
        verifyWithAnySecret<SessionClaims>(jwtService, expiredToken, [NEW_SECRET]),
      ).rejects.toThrow(/expired/i);
    });

    it('fails closed when no secret is configured', async () => {
      const anyToken = await signWith(NEW_SECRET);

      await expect(verifyWithAnySecret<SessionClaims>(jwtService, anyToken, [])).rejects.toThrow(
        /No verification secret configured/,
      );
    });
  });
});
