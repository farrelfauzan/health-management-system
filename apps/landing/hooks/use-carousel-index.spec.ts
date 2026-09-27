import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCarouselIndex } from '#hooks/use-carousel-index';

const INTERVAL_MS = 1000;

describe('useCarouselIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances by itself and loops back to the first slide', () => {
    const { result } = renderHook(() => useCarouselIndex({ count: 3, intervalMs: INTERVAL_MS }));
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 3);
    });
    expect(result.current.index).toBe(0);
  });

  it('wraps backwards from the first slide to the last', () => {
    const { result } = renderHook(() => useCarouselIndex({ count: 4, intervalMs: INTERVAL_MS }));
    act(() => {
      result.current.goToPrevious();
    });
    expect(result.current.index).toBe(3);
  });

  it('restarts the timer after a manual move', () => {
    const { result } = renderHook(() => useCarouselIndex({ count: 5, intervalMs: INTERVAL_MS }));
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS - 100);
    });
    act(() => {
      result.current.goTo(2);
    });
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS - 100);
    });
    expect(result.current.index).toBe(2);
  });

  it('stays put when the visitor prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    const { result } = renderHook(() => useCarouselIndex({ count: 3, intervalMs: INTERVAL_MS }));
    act(() => {
      vi.advanceTimersByTime(INTERVAL_MS * 2);
    });
    expect(result.current.index).toBe(0);
  });
});
