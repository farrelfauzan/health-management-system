import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Decision records (D-033), tickets (P22-T05, SJ-158) and improvement ids
 * (IMP-3) are how the team talks, not what a clinic admin can act on. On
 * 2026-09-23 an IAM warning citing "D-033" read as an unexplained error; the
 * rule it names belongs in plain words instead.
 */
const INTERNAL_CODE_PATTERN = /\b(?:D-\d{3}|P\d{2}-T\d{2}|SJ-\d+|IMP-\d+)\b/;

function collectStrings(value: unknown, path: string, found: string[]): void {
  if (typeof value === 'string') {
    if (INTERNAL_CODE_PATTERN.test(value)) {
      found.push(`${path}: ${value}`);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => collectStrings(child, `${path}.${key}`, found));
  }
}

describe('user-facing messages', () => {
  it.each(['id', 'en'])('carry no internal decision or ticket codes (%s)', (locale) => {
    const directory = resolve(__dirname, locale);
    const found: string[] = [];
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
      const messages: unknown = JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
      collectStrings(messages, `${locale}/${file}`, found);
    }

    expect(found).toEqual([]);
  });
});
