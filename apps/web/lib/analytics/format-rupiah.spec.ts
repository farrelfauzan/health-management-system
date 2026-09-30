import { describe, expect, it } from 'vitest';

import { formatRupiah } from './format-rupiah';

const NBSP = ' ';

describe('formatRupiah', () => {
  it('shortens a million and more on a tile, in the Indonesian way', () => {
    expect(formatRupiah(186_400_000, 'id', { isCompact: true })).toBe(`Rp186,4${NBSP}jt`);
    expect(formatRupiah(1_298_086_333, 'id', { isCompact: true })).toBe(`Rp1,3${NBSP}M`);
  });

  it('keeps anything under a million whole, even when asked to shorten', () => {
    expect(formatRupiah(162_500, 'id', { isCompact: true })).toBe('Rp162.500');
  });

  it('writes the full figure for a table', () => {
    expect(formatRupiah(61_200_000, 'id')).toBe('Rp61.200.000');
  });

  it('signs a change with a plus or a true minus', () => {
    expect(formatRupiah(1_400_000, 'id', { isCompact: true, isSigned: true })).toBe(
      `+Rp1,4${NBSP}jt`,
    );
    expect(formatRupiah(-1_400_000, 'id', { isCompact: true, isSigned: true })).toBe(
      `−Rp1,4${NBSP}jt`,
    );
    expect(formatRupiah(0, 'id', { isSigned: true })).toBe('Rp0');
  });
});
