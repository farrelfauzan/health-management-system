import { describe, expect, it } from 'vitest';

import enMessages from './en/dashboard-ai.json';
import idMessages from './id/dashboard-ai.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix.length > 0 ? `${prefix}.${key}` : key),
  );
}

describe('dashboard-ai message catalogs', () => {
  it('keeps Indonesian and English keys in sync', () => {
    expect(collectLeafKeys(idMessages).sort()).toEqual(collectLeafKeys(enMessages).sort());
  });

  it.each([
    ['id', idMessages],
    ['en', enMessages],
  ])('contains no empty %s messages', (_locale, messages) => {
    for (const key of collectLeafKeys(messages)) {
      const value = key
        .split('.')
        .reduce<unknown>(
          (current, segment) => (current as Record<string, unknown>)[segment],
          messages,
        );
      expect(value).not.toBe('');
    }
  });
});
