import { describe, expect, it } from 'vitest';

import { buildPaginationWindow } from './pagination-window';

describe('buildPaginationWindow', () => {
  it('returns every page when the total fits without truncation', () => {
    expect(buildPaginationWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns an empty window for zero pages', () => {
    expect(buildPaginationWindow(1, 0)).toEqual([]);
  });

  it('collapses the tail when the current page is near the start', () => {
    expect(buildPaginationWindow(2, 20)).toEqual([1, 2, 3, 'ellipsis', 20]);
  });

  it('collapses the head when the current page is near the end', () => {
    expect(buildPaginationWindow(19, 20)).toEqual([1, 'ellipsis', 18, 19, 20]);
  });

  it('collapses both sides when the current page is in the middle', () => {
    expect(buildPaginationWindow(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });

  it('clamps an out-of-range page into the valid window', () => {
    expect(buildPaginationWindow(99, 20)).toEqual([1, 'ellipsis', 19, 20]);
  });
});
