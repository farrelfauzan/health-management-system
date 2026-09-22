import type { TriStateValue } from '#lib/bpjs-non-capitation/tri-state-value';

export function toTriStateValue(value: boolean | null): TriStateValue {
  if (value === null) {
    return 'unknown';
  }
  return value ? 'yes' : 'no';
}
