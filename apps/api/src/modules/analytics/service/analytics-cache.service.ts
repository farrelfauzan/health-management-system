import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCacheEntry,
  AnalyticsCacheKeyParts,
  GetOrLoadAnalyticsParams,
} from '@hms/shared-types';

/**
 * Five minutes per dashboard and filter set, in memory (PRD NFR-AN-07).
 * Analytics reads whole months of rows, and a manager flicking between two
 * tabs should not run the same aggregate twice. In a multi-instance
 * deployment each instance keeps its own copy, which the five-minute
 * staleness already allows for.
 *
 * The in-flight promise is what is cached, so concurrent requests for the
 * same answer share one query. A failed load is dropped at once rather than
 * served as a failure for five minutes.
 */
@Injectable()
export class AnalyticsCacheService {
  private static readonly TTL_MS = 5 * 60_000;
  private static readonly MAX_ENTRIES = 500;

  private readonly entries = new Map<string, AnalyticsCacheEntry>();

  /** The cached answer for `key`, or the result of `load` stored under it. */
  getOrLoad<TValue>({ key, load }: GetOrLoadAnalyticsParams<TValue>): Promise<TValue> {
    const cacheKey = this.buildCacheKey(key);
    const nowMs = Date.now();
    const cached = this.entries.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
      return cached.value as Promise<TValue>;
    }
    const value = load().catch((error: unknown) => {
      this.entries.delete(cacheKey);
      throw error;
    });
    this.saveEntry(cacheKey, { expiresAtMs: nowMs + AnalyticsCacheService.TTL_MS, value });
    return value;
  }

  private saveEntry(cacheKey: string, entry: AnalyticsCacheEntry): void {
    this.entries.delete(cacheKey);
    if (this.entries.size >= AnalyticsCacheService.MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(cacheKey, entry);
  }

  private buildCacheKey({ dashboard, filter, viewerId }: AnalyticsCacheKeyParts): string {
    const sortedFilter = Object.keys(filter)
      .sort()
      .filter((name) => filter[name] !== undefined)
      .map((name) => [name, filter[name]]);
    return JSON.stringify([dashboard, viewerId ?? null, sortedFilter]);
  }
}
