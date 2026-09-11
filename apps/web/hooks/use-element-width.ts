import { useEffect, useState, type RefObject } from 'react';

/**
 * An element's rendered width, kept current as it resizes. For content that
 * is laid out to a pixel width rather than by CSS: a PDF page is rasterised
 * at a width, so it cannot simply be told to fill its box. `0` until the
 * element has been measured, and where `ResizeObserver` is unavailable.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
