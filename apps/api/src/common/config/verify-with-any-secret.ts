import { JwtService } from '@nestjs/jwt';

/**
 * Verifies a token against an ordered key list, returning the first success
 * (SJ-5). This is what makes a key rotation invisible to signed-in users: a
 * token minted under yesterday's key still verifies while that key remains in
 * `*_PREVIOUS`.
 *
 * Rejects by rethrowing the *last* failure, so the caller sees a genuine JWT
 * error (expired, malformed, bad signature) rather than a synthesised one.
 * Failing keys are not logged: which key a token failed against is a detail
 * that only helps someone probing for a retired secret.
 */
export async function verifyWithAnySecret<TPayload extends object>(
  jwtService: JwtService,
  token: string,
  secrets: readonly string[],
): Promise<TPayload> {
  let lastError: unknown = new Error('No verification secret configured');
  for (const secret of secrets) {
    try {
      return await jwtService.verifyAsync<TPayload>(token, { secret });
    } catch (err: unknown) {
      lastError = err;
    }
  }
  throw lastError;
}
