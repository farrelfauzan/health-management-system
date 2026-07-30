import { describe, expect, it } from 'vitest';

import enMessages from '../messages/en.json';
import idMessages from '../messages/id.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translation catalogs', () => {
  it('keeps Indonesian and English message keys in parity', () => {
    expect(collectLeafKeys(enMessages).sort()).toEqual(collectLeafKeys(idMessages).sort());
  });

  it.each([
    ['id', idMessages],
    ['en', enMessages],
  ])('contains no empty %s messages', (_locale, messages) => {
    const leaves = collectLeafKeys(messages);
    for (const key of leaves) {
      const value = key.split('.').reduce<unknown>((current, part) => {
        return (current as Record<string, unknown>)[part];
      }, messages);
      expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
    }
  });
});
