import { describe, expect, it } from 'vitest';

import { formatRupiah } from './format-rupiah';

function normalize(value: string): string {
  // Intl separates the currency symbol with U+00A0, not a plain space.
  return value.replace(/\u00a0/g, ' ');
}

describe('formatRupiah', () => {
  it('formats whole rupiah without decimals', () => {
    expect(normalize(formatRupiah(150000))).toBe('Rp 150.000');
  });

  it('keeps fractional rupiah when the amount carries them', () => {
    expect(normalize(formatRupiah(1500.5))).toBe('Rp 1.500,5');
  });

  it('formats zero rather than reading as missing', () => {
    expect(normalize(formatRupiah(0))).toBe('Rp 0');
  });

  it('returns a dash for a non-finite amount', () => {
    expect(formatRupiah(Number.NaN)).toBe('-');
  });
});
