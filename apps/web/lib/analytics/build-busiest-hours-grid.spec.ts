import { describe, expect, it } from 'vitest';

import { buildBusiestHoursGrid } from './build-busiest-hours-grid';

describe('buildBusiestHoursGrid', () => {
  it('shows Monday to Sunday over 07–20 with no data', () => {
    const actual = buildBusiestHoursGrid([]);

    expect(actual.rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(actual.hours[0]).toBe(7);
    expect(actual.hours.at(-1)).toBe(20);
    expect(actual.busiest).toBeNull();
  });

  it('widens the hours to a check-in outside 07–20', () => {
    const actual = buildBusiestHoursGrid([{ weekday: 6, hour: 22, checkIns: 1 }]);

    expect(actual.hours.at(-1)).toBe(22);
  });

  it('shades relative to the busiest cell and names it', () => {
    const actual = buildBusiestHoursGrid([
      { weekday: 1, hour: 8, checkIns: 96 },
      { weekday: 1, hour: 9, checkIns: 48 },
      { weekday: 2, hour: 8, checkIns: 1 },
    ]);
    const monday = actual.rows[0]?.cells ?? [];
    const tuesday = actual.rows[1]?.cells ?? [];

    expect(monday.find((cell) => cell.hour === 8)?.shade).toBe(4);
    expect(monday.find((cell) => cell.hour === 9)?.shade).toBe(2);
    expect(tuesday.find((cell) => cell.hour === 8)?.shade).toBe(1);
    expect(monday.find((cell) => cell.hour === 12)?.shade).toBe(0);
    expect(actual.busiest).toEqual({ weekday: 1, hour: 8, checkIns: 96 });
  });
});
