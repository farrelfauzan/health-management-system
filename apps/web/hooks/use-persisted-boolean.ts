'use client';

import { useEffect, useState } from 'react';

/**
 * A boolean preference that survives navigation and reload.
 *
 * It starts from `initialValue` on every render path — including the server's
 * — and adopts the stored value in an effect, because reading `localStorage`
 * during render would hydrate against markup the server could not have
 * produced. The one-frame flash that costs is cheaper than a hydration
 * mismatch on a layout element.
 *
 * Storage access is guarded: a browser with cookies blocked throws on
 * `localStorage`, and losing a layout preference must not take the screen
 * down with it.
 */
export function usePersistedBoolean(
  storageKey: string,
  initialValue: boolean,
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    const stored = readStoredValue(storageKey);
    if (stored !== null) {
      setValue(stored === 'true');
    }
  }, [storageKey]);
  function persistValue(next: boolean): void {
    setValue(next);
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // A preference we cannot store is still a preference for this session.
    }
  }
  return [value, persistValue];
}

function readStoredValue(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
