import { useCallback, useEffect, useState } from 'react';

import type { CarouselIndex } from '#lib/landing/carousel-index';
import { isReducedMotionPreferred } from '#lib/landing/is-reduced-motion-preferred';
import { wrapIndex } from '#lib/landing/wrap-index';

type UseCarouselIndexOptions = {
  readonly count: number;
  readonly intervalMs: number;
};

/**
 * Tracks the visible slide of an auto-advancing carousel. Any manual move restarts the
 * timer, and nothing advances by itself when the visitor prefers reduced motion.
 */
export function useCarouselIndex({ count, intervalMs }: UseCarouselIndexOptions): CarouselIndex {
  const [index, setIndex] = useState<number>(0);
  const [timerKey, setTimerKey] = useState<number>(0);
  useEffect(() => {
    if (count < 2 || isReducedMotionPreferred()) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => wrapIndex(current + 1, count));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [count, intervalMs, timerKey]);
  const goTo = useCallback(
    (target: number): void => {
      setIndex(wrapIndex(target, count));
      setTimerKey((key) => key + 1);
    },
    [count],
  );
  const goToNext = useCallback((): void => goTo(index + 1), [goTo, index]);
  const goToPrevious = useCallback((): void => goTo(index - 1), [goTo, index]);
  return { index, goTo, goToNext, goToPrevious };
}
