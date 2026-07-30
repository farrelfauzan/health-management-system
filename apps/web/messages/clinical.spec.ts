import { describe, expect, it } from 'vitest';

import enMessages from './en/clinical.json';
import idMessages from './id/clinical.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix.length > 0 ? `${prefix}.${key}` : key),
  );
}

describe('clinical message catalogs', () => {
  it('keeps Indonesian and English keys in sync', () => {
    expect(collectLeafKeys(idMessages).sort()).toEqual(collectLeafKeys(enMessages).sort());
  });
});
