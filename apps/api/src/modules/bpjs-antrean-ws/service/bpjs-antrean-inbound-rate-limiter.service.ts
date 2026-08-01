import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

type WindowCounter = {
  windowStartedAt: number;
  count: number;
};

/**
 * Per-endpoint, per-source rate limiting for the inbound Antrean surface
 * (P14-T04). A fixed one-minute window, counted in process.
 *
 * **What this is and is not.** It exists because the write endpoints are
 * reachable by anyone who finds the host, and a caller that gets past the
 * allowlist and the token check should still not be able to hammer
 * `pasien baru`. It is *not* a distributed limiter: two API replicas each
 * enforce their own budget, so the effective ceiling is the configured rate
 * times the replica count. That is stated rather than hidden because the
 * alternative — a database round trip on the hot path of a public endpoint —
 * would hand an attacker a cheaper way to hurt the clinic than the requests
 * themselves. HMS ships single-instance today; a multi-replica deployment
 * should put the real ceiling in front of the API, where it belongs.
 *
 * The key map is bounded. An attacker rotating source addresses inside a
 * trusted-proxy chain must not be able to grow it without limit, so the map
 * is cleared wholesale once it exceeds {@link MAX_TRACKED_KEYS} — losing a
 * minute of counts is a far smaller problem than unbounded memory.
 */
@Injectable()
export class BpjsAntreanInboundRateLimiter {
  private readonly counters = new Map<string, WindowCounter>();

  /**
   * Records one request and reports whether it stays within budget. A limit
   * of zero disables the endpoint outright rather than allowing everything —
   * "no budget" reads as none, not as unlimited.
   */
  tryConsume(params: { key: string; limitPerMinute: number }): boolean {
    const now = Date.now();
    this.evictIfOversized();
    const counter = this.counters.get(params.key);
    if (counter === undefined || now - counter.windowStartedAt >= WINDOW_MS) {
      this.counters.set(params.key, { windowStartedAt: now, count: 1 });
      return params.limitPerMinute >= 1;
    }
    counter.count += 1;
    return counter.count <= params.limitPerMinute;
  }

  private evictIfOversized(): void {
    if (this.counters.size <= MAX_TRACKED_KEYS) {
      return;
    }
    this.counters.clear();
  }
}
