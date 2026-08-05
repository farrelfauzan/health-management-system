'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a textarea exactly as tall as what has been typed into it, up to a
 * ceiling, after which it scrolls.
 *
 * Done in JS rather than with the `field-sizing: content` the shadcn textarea
 * already carries, because that property is still Chromium-only: on a browser
 * without it the box would be frozen at one row and a multi-line draft would
 * scroll inside a single visible line. An explicit inline height wins over
 * `field-sizing` where both apply, so the behaviour is the same everywhere.
 *
 * The height is reset to `auto` before it is read, which is what lets the box
 * shrink again — `scrollHeight` never reports less than the current height.
 */
export function useAutoResizingTextarea(
  value: string,
  maxHeightPx: number,
): RefObject<HTMLTextAreaElement | null> {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }
    element.style.height = 'auto';
    const contentHeight = element.scrollHeight;
    element.style.height = `${Math.min(contentHeight, maxHeightPx)}px`;
    element.style.overflowY = contentHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [value, maxHeightPx]);
  return textareaRef;
}
