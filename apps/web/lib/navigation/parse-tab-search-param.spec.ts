import { describe, expect, it } from 'vitest';

import { parseTabSearchParam } from './parse-tab-search-param';

const ROOM_TABS = ['occupancy', 'wards', 'rooms', 'beds', 'classes'] as const;

describe('parseTabSearchParam', () => {
  it('returns the tab when the value names one of the allowed tabs', () => {
    expect(parseTabSearchParam('beds', ROOM_TABS)).toBe('beds');
  });

  it('returns undefined when the value is absent', () => {
    expect(parseTabSearchParam(undefined, ROOM_TABS)).toBeUndefined();
    expect(parseTabSearchParam(null, ROOM_TABS)).toBeUndefined();
  });

  it('returns undefined when the value names an unknown tab', () => {
    expect(parseTabSearchParam('kitchen', ROOM_TABS)).toBeUndefined();
    expect(parseTabSearchParam('', ROOM_TABS)).toBeUndefined();
  });

  it('reads the first value when the key is repeated', () => {
    expect(parseTabSearchParam(['wards', 'beds'], ROOM_TABS)).toBe('wards');
  });

  it('ignores a tab this person may not see', () => {
    expect(parseTabSearchParam('classes', ['occupancy', 'wards'])).toBeUndefined();
  });
});
