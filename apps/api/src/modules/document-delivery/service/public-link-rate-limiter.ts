import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { PublicLinkRateLimitRequest } from '@hms/shared-types';

const WINDOW_MS = 60_000;
const PRUNE_EVERY_MS = WINDOW_MS;

type WindowCounter = {
  windowStartedAt: number;
  count: number;
};

/**
 * Fixed-window counters for the one unauthenticated surface in this PRD
 * (`P16-T25`, §7.4.9): the public delivery-link route is limited per caller
 * address and per token, so neither a scan of the token space nor a loop on
 * one leaked link gets far. In memory and per replica on purpose — the limit
 * exists to make enumeration expensive, not to be an exact quota, and a
 * shared store for it would be a dependency out of proportion to the route.
 */
@Injectable()
export class PublicLinkRateLimiter {
  private readonly counters = new Map<string, WindowCounter>();
  private lastPrunedAt = 0;

  /** Throws 429 once the key has been seen more than `limit` times this minute. */
  assertWithinLimit(request: PublicLinkRateLimitRequest, now: number = Date.now()): void {
    this.pruneExpired(now);
    const counter = this.counters.get(request.key);
    if (counter === undefined || now - counter.windowStartedAt >= WINDOW_MS) {
      this.counters.set(request.key, { windowStartedAt: now, count: 1 });
      return;
    }
    counter.count += 1;
    if (counter.count > request.limit) {
      throw new HttpException(
        { message: 'Too many requests. Try again in a minute.', code: 'RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private pruneExpired(now: number): void {
    if (now - this.lastPrunedAt < PRUNE_EVERY_MS) {
      return;
    }
    this.lastPrunedAt = now;
    for (const [key, counter] of this.counters) {
      if (now - counter.windowStartedAt >= WINDOW_MS) {
        this.counters.delete(key);
      }
    }
  }
}
