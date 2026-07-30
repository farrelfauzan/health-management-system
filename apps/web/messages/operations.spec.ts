import { describe, expect, it } from 'vitest';

import enMessages from './en/operations.json';
import idMessages from './id/operations.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('operations message catalogs', () => {
  it('keeps Indonesian and English keys in sync', () => {
    expect(collectLeafKeys(idMessages).sort()).toEqual(collectLeafKeys(enMessages).sort());
  });
});
