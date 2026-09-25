import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_ROOT = join(__dirname, '..', '..');
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['generated', 'node_modules']);

/** `new XException({ error: {...} })` — the envelope built by hand, one level too deep. */
const NESTED_ENVELOPE_PATTERN = /new\s+\w*Exception\s*\(\s*\{\s*error\s*:/g;

/**
 * `new XException({ ..., details: ... })` with `details` as a top-level key.
 * Template literals (`${...}`) are allowed before it; any other brace means the
 * key sits in a nested object and is someone else's business.
 */
const TOP_LEVEL_DETAILS_PATTERN =
  /new\s+\w*Exception\s*\(\s*\{(?:[^{}]|\$\{[^{}]*\})*?\bdetails\s*:/g;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry) ? [] : listSourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function findOffenders(pattern: RegExp): string[] {
  return listSourceFiles(SOURCE_ROOT).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(pattern)].map((match) => {
      const line = source.slice(0, match.index).split('\n').length;
      return `${relative(SOURCE_ROOT, path)}:${line}`;
    });
  });
}

/**
 * `AllExceptionsFilter` builds `{ error: { code, message, details } }` from the
 * exception body's top-level `code`, `message` and `errors`. A body shaped any
 * other way still compiles, still passes a `getResponse()` assertion, and then
 * reaches the client as "Http Exception" with a status-derived code and no
 * details — a throttled login lost its wait, a lab refusal lost its reason.
 */
describe('exception bodies match what the global filter reads', () => {
  it('never nests the envelope under its own `error` key', () => {
    expect(findOffenders(NESTED_ENVELOPE_PATTERN)).toEqual([]);
  });

  it('carries details as `errors`, the key the filter renders as `details`', () => {
    expect(findOffenders(TOP_LEVEL_DETAILS_PATTERN)).toEqual([]);
  });
});
