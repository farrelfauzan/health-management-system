import { describe, expect, it } from 'vitest';

import enMessages from './en/auth-shell.json';
import idMessages from './id/auth-shell.json';

function collectLeafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null ? collectLeafKeys(child, path) : [path];
  });
}

describe('auth-shell message catalogs', () => {
  it('keeps Indonesian and English feature keys in sync', () => {
    expect(collectLeafKeys(enMessages).sort()).toEqual(collectLeafKeys(idMessages).sort());
  });

  it.each([
    ['id', idMessages],
    ['en', enMessages],
  ])('contains no empty %s messages', (_locale, messages) => {
    const leaves = collectLeafKeys(messages);
    for (const key of leaves) {
      const value = key.split('.').reduce<unknown>((current, segment) => {
        return (current as Record<string, unknown>)[segment];
      }, messages);
      expect(value).not.toBe('');
    }
  });
});
