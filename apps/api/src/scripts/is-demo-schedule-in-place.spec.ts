import { buildDemoScheduleEntries } from './build-demo-schedule-entries';
import { isDemoScheduleInPlace } from './is-demo-schedule-in-place';

describe('buildDemoScheduleEntries', () => {
  it('opens every day of the week, 07:00 to 22:00, with unlimited capacity', () => {
    const actualEntries = buildDemoScheduleEntries();
    expect(actualEntries.map((entry) => entry.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    actualEntries.forEach((entry) =>
      expect(entry).toEqual({
        dayOfWeek: entry.dayOfWeek,
        startTime: '07:00',
        endTime: '22:00',
        isAvailable: true,
        maxPatients: null,
      }),
    );
  });
});

describe('isDemoScheduleInPlace', () => {
  const expectedEntries = buildDemoScheduleEntries();

  it('is true for the demo schedule stored in any order', () => {
    const inputStored = [...expectedEntries].reverse();
    expect(isDemoScheduleInPlace({ stored: inputStored, expected: expectedEntries })).toBe(true);
  });

  it('is false when nothing is stored yet', () => {
    expect(isDemoScheduleInPlace({ stored: [], expected: expectedEntries })).toBe(false);
  });

  it('is false when a day is missing', () => {
    const inputStored = expectedEntries.slice(1);
    expect(isDemoScheduleInPlace({ stored: inputStored, expected: expectedEntries })).toBe(false);
  });

  it('is false when a window was edited', () => {
    const inputStored = expectedEntries.map((entry) =>
      entry.dayOfWeek === 3 ? { ...entry, endTime: '12:00' } : entry,
    );
    expect(isDemoScheduleInPlace({ stored: inputStored, expected: expectedEntries })).toBe(false);
  });

  it('is false when somebody capped a day', () => {
    const inputStored = expectedEntries.map((entry) =>
      entry.dayOfWeek === 0 ? { ...entry, maxPatients: 10 } : entry,
    );
    expect(isDemoScheduleInPlace({ stored: inputStored, expected: expectedEntries })).toBe(false);
  });
});
