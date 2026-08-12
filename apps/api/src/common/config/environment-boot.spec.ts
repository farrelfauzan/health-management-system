import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Structural half of SJ-5's fail-fast guarantee: the validator is actually
 * wired into `AppModule`, and no secret has crept back in behind a fallback.
 *
 * The behavioural half lives in `validate-environment.spec.ts`. Booting a real
 * module with a missing secret is deliberately *not* attempted here —
 * `ConfigModule.forRoot` throws while the module is being evaluated, which
 * surfaces as an uncaught exception that kills the jest worker rather than
 * failing a matcher, whichever way the call is wrapped. That path is verified
 * by actually starting the API with a blank secret; the procedure is in
 * `docs/security/secrets.md`.
 *
 * These assertions are cheap and they fail loudly on the two regressions that
 * would silently undo this ticket: unhooking the validator, and reintroducing
 * a compiled-in default.
 */
describe('Environment validation wiring', () => {
  function readApiSource(relativePath: string): string {
    return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
  }

  it('runs the validator at bootstrap, before the application is created', () => {
    const mainSource = readApiSource('main.ts');

    expect(mainSource).toContain('validateEnvironment(process.env)');
    expect(mainSource.indexOf('validateEnvironment(process.env)')).toBeLessThan(
      mainSource.indexOf('NestFactory.create'),
    );
  });

  /**
   * Wiring it as ConfigModule's `validate` hook looks tidier and is wrong: the
   * hook's return value becomes `validatedEnvConfig`, which `ConfigService`
   * consults ahead of `process.env`, freezing configuration at import time.
   */
  it('keeps the validator out of the ConfigModule hook', () => {
    expect(readApiSource('app.module.ts')).not.toContain('validate: validateEnvironment');
  });

  /**
   * The six call sites this ticket removed. A fallback turns a missing secret
   * into a working deployment signed with a value published in this
   * repository — and a deployment that works is one nobody investigates.
   */
  it.each([
    'app.module.ts',
    'modules/auth/auth.module.ts',
    'modules/auth/service/auth.service.ts',
    'common/auth/jwt-auth.guard.ts',
  ])('leaves no hardcoded secret fallback in %s', (relativePath) => {
    expect(readApiSource(relativePath)).not.toMatch(/\?\?\s*['"]dev-[a-z]+-secret['"]/);
  });

  it('reads JWT key material only through JwtSecretsService', () => {
    for (const relativePath of [
      'modules/auth/service/auth.service.ts',
      'common/auth/jwt-auth.guard.ts',
    ]) {
      expect(readApiSource(relativePath)).not.toMatch(
        /get<string>\('JWT_(ACCESS|REFRESH)_SECRET'\)/,
      );
    }
  });
});
