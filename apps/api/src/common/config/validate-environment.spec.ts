import { validateEnvironment } from './validate-environment';

const STRONG_SECRET = 'a'.repeat(48);

function buildEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'dev-access-secret',
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('accepts a complete development environment', () => {
    expect(() => validateEnvironment(buildEnv())).not.toThrow();
  });

  it('returns the configuration unchanged so ConfigModule keeps every optional key', () => {
    const inputEnv = buildEnv({ SOME_OPTIONAL_SETTING: 'kept' });

    const actual = validateEnvironment(inputEnv);

    expect(actual).toBe(inputEnv);
    expect(actual.SOME_OPTIONAL_SETTING).toBe('kept');
  });

  it.each(['DATABASE_URL', 'JWT_ACCESS_SECRET'])(
    'fails startup when %s is absent',
    (key) => {
      const inputEnv = buildEnv({ [key]: undefined });

      expect(() => validateEnvironment(inputEnv)).toThrow(new RegExp(`${key} is required`));
    },
  );

  /**
   * An unconfigured GitHub secret expands to `""`, not to unset — so an empty
   * string is the shape a real misconfiguration actually arrives in.
   */
  it.each(['', '   '])('treats a blank secret (%p) as missing', (blank) => {
    expect(() => validateEnvironment(buildEnv({ JWT_ACCESS_SECRET: blank }))).toThrow(
      /JWT_ACCESS_SECRET is required/,
    );
  });

  it('lists every problem at once rather than one per restart', () => {
    const inputEnv = buildEnv({ DATABASE_URL: undefined, JWT_ACCESS_SECRET: undefined });

    expect(() => validateEnvironment(inputEnv)).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  /**
   * SJ-6 made refresh tokens opaque, so nothing signs them. A deployment that
   * still sets the old variable is fine; one that does not must still boot.
   */
  it('no longer requires JWT_REFRESH_SECRET', () => {
    expect(() => validateEnvironment(buildEnv({ JWT_REFRESH_SECRET: undefined }))).not.toThrow();
  });

  describe('production hardening', () => {
    it('refuses a known placeholder value', () => {
      const inputEnv = buildEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'dev-access-secret' });

      expect(() => validateEnvironment(inputEnv)).toThrow(/known placeholder value/);
    });

    it('refuses the .env.example placeholder specifically', () => {
      const inputEnv = buildEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-strong-secret',
      });

      expect(() => validateEnvironment(inputEnv)).toThrow(/known placeholder value/);
    });

    it('refuses a secret shorter than the minimum length', () => {
      const inputEnv = buildEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short-but-not-a-placeholder',
      });

      expect(() => validateEnvironment(inputEnv)).toThrow(/at least 32 characters/);
    });

    it('accepts strong secrets', () => {
      const inputEnv = buildEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: STRONG_SECRET,
      });

      expect(() => validateEnvironment(inputEnv)).not.toThrow();
    });

    /**
     * The dev values are the point in dev and CI — every spec signs its
     * fixtures with them. Only production may refuse them.
     */
    it('leaves development free to use the well-known values', () => {
      expect(() => validateEnvironment(buildEnv({ NODE_ENV: 'development' }))).not.toThrow();
    });
  });
});
