import { HttpException } from '@nestjs/common';

import { PublicLinkRateLimiter } from './public-link-rate-limiter';

describe('PublicLinkRateLimiter', () => {
  const START = 1_700_000_000_000;

  it('allows up to the limit within one window and refuses the next', () => {
    const limiter = new PublicLinkRateLimiter();

    for (let i = 0; i < 3; i += 1) {
      limiter.assertWithinLimit({ key: 'ip:1.2.3.4', limit: 3 }, START + i);
    }

    expect(() => limiter.assertWithinLimit({ key: 'ip:1.2.3.4', limit: 3 }, START + 10)).toThrow(
      HttpException,
    );
  });

  it('reports 429 with a stable code', () => {
    const limiter = new PublicLinkRateLimiter();
    limiter.assertWithinLimit({ key: 'token:abc', limit: 1 }, START);

    let actual: HttpException | undefined;
    try {
      limiter.assertWithinLimit({ key: 'token:abc', limit: 1 }, START + 1);
    } catch (err: unknown) {
      actual = err as HttpException;
    }

    expect(actual?.getStatus()).toBe(429);
    expect(actual?.getResponse()).toEqual(expect.objectContaining({ code: 'RATE_LIMITED' }));
  });

  it('starts a fresh window once a minute has passed', () => {
    const limiter = new PublicLinkRateLimiter();
    limiter.assertWithinLimit({ key: 'ip:1.2.3.4', limit: 1 }, START);

    expect(() =>
      limiter.assertWithinLimit({ key: 'ip:1.2.3.4', limit: 1 }, START + 60_000),
    ).not.toThrow();
  });

  it('counts keys independently', () => {
    const limiter = new PublicLinkRateLimiter();
    limiter.assertWithinLimit({ key: 'ip:a', limit: 1 }, START);

    expect(() => limiter.assertWithinLimit({ key: 'ip:b', limit: 1 }, START + 1)).not.toThrow();
  });
});
