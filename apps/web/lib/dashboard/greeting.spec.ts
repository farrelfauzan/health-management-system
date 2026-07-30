import { describe, expect, it } from 'vitest';

import { resolveDashboardDayPart } from './greeting';

describe('resolveDashboardDayPart', () => {
  it('resolves morning before noon', () => {
    expect(resolveDashboardDayPart(9)).toBe('morning');
  });

  it('greets with good afternoon between noon and 6 PM', () => {
    expect(resolveDashboardDayPart(13)).toBe('afternoon');
  });

  it('greets with good evening from 6 PM onward', () => {
    expect(resolveDashboardDayPart(19)).toBe('evening');
  });
});
