'use client';

import { useEffect, useState } from 'react';

/**
 * Trails the input by `delayMs` so consumers keyed on the returned value (a
 * search request per query, for instance) fire once per pause, not once per
 * keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debouncedValue;
}
