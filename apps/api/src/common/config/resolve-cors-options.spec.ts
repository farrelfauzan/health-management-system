import { resolveCorsOptions } from './resolve-cors-options';

describe('resolveCorsOptions (SJ-1)', () => {
  it('uses the configured allowlist', () => {
    const actual = resolveCorsOptions({
      CORS_ALLOWED_ORIGINS: 'https://hms.example.id,https://admin.example.id',
    });

    expect(actual.origin).toEqual(['https://hms.example.id', 'https://admin.example.id']);
  });

  it('tolerates the spacing people actually type', () => {
    const actual = resolveCorsOptions({
      CORS_ALLOWED_ORIGINS: ' https://a.example.id , , https://b.example.id ',
    });

    expect(actual.origin).toEqual(['https://a.example.id', 'https://b.example.id']);
  });

  it('falls back to the local web app outside production', () => {
    const actual = resolveCorsOptions({ NODE_ENV: 'development' });

    expect(actual.origin).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
  });

  /**
   * The case that matters. A production deployment that forgot the allowlist
   * should be visibly broken, not invisibly permissive — falling back to
   * `localhost` there would be harmless-looking and wrong, and reflecting the
   * caller's origin would be the open door this ticket closes.
   */
  it('allows nothing in production when the allowlist is missing', () => {
    const actual = resolveCorsOptions({ NODE_ENV: 'production' });

    expect(actual.origin).toEqual([]);
  });

  it('never reflects the caller’s origin', () => {
    const actual = resolveCorsOptions({ NODE_ENV: 'development' });

    expect(typeof actual.origin).not.toBe('boolean');
    expect(Array.isArray(actual.origin)).toBe(true);
  });

  it('keeps credentials on, which is why the allowlist matters', () => {
    expect(resolveCorsOptions({}).credentials).toBe(true);
  });

  it('lists methods and headers rather than reflecting them', () => {
    const actual = resolveCorsOptions({});

    expect(actual.allowedHeaders).toEqual(['Content-Type', 'Authorization', 'X-Request-Id']);
    expect(actual.exposedHeaders).toEqual(['X-Request-Id']);
    expect(actual.methods).toContain('OPTIONS');
  });
});
