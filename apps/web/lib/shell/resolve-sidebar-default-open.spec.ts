import { describe, expect, it } from 'vitest';

import { resolveSidebarDefaultOpen } from './resolve-sidebar-default-open';

describe('resolveSidebarDefaultOpen', () => {
  it('collapses only when the cookie says so', () => {
    expect(resolveSidebarDefaultOpen('false')).toBe(false);
  });

  it('expands when the cookie says open', () => {
    expect(resolveSidebarDefaultOpen('true')).toBe(true);
  });

  it('expands on a first visit with no cookie', () => {
    expect(resolveSidebarDefaultOpen(undefined)).toBe(true);
  });

  it('expands on a value it does not recognise', () => {
    expect(resolveSidebarDefaultOpen('collapsed')).toBe(true);
  });
});
