import type { TriStateValue } from '#lib/bpjs-non-capitation/tri-state-value';

export function fromTriStateValue(value: TriStateValue): boolean | null {
  if (value === 'unknown') {
    return null;
  }
  return value === 'yes';
}
