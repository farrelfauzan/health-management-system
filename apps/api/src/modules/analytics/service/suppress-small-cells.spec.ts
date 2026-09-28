import { suppressSmallCells, suppressSmallCount } from '@hms/shared-types';

describe('suppressSmallCells', () => {
  it('hides the 3 and the 9 in [40, 12, 3, 9] and leaves the total at 64', () => {
    const inputCells = [
      { key: 'A09', count: 40 },
      { key: 'J06', count: 12 },
      { key: 'K29', count: 3 },
      { key: 'I10', count: 9 },
    ];
    const expectedTotal = inputCells.reduce((sum, cell) => sum + cell.count, 0);

    const actual = suppressSmallCells({ cells: inputCells });

    expect(actual.map((cell) => cell.count)).toEqual([
      40,
      12,
      { suppressed: true },
      { suppressed: true },
    ]);
    expect(actual.map((cell) => cell.key)).toEqual(['A09', 'J06', 'K29', 'I10']);
    expect(expectedTotal).toBe(64);
  });

  it('hides every small cell and nothing more when two or more are small', () => {
    const actual = suppressSmallCells({
      cells: [{ count: 30 }, { count: 2 }, { count: 4 }, { count: 7 }],
    });

    expect(actual.map((cell) => cell.count)).toEqual([
      30,
      { suppressed: true },
      { suppressed: true },
      7,
    ]);
  });

  it('shows zero, which reveals nobody, and does not spend the second hide on it', () => {
    const actual = suppressSmallCells({ cells: [{ count: 0 }, { count: 1 }, { count: 20 }] });

    expect(actual.map((cell) => cell.count)).toEqual([
      0,
      { suppressed: true },
      { suppressed: true },
    ]);
  });

  it('leaves a breakdown with no small cells untouched', () => {
    const actual = suppressSmallCells({ cells: [{ count: 5 }, { count: 50 }] });

    expect(actual.map((cell) => cell.count)).toEqual([5, 50]);
  });

  it('honours a different threshold', () => {
    const actual = suppressSmallCells({
      cells: [{ count: 9 }, { count: 11 }, { count: 30 }],
      threshold: 11,
    });

    expect(actual.map((cell) => cell.count)).toEqual([
      { suppressed: true },
      { suppressed: true },
      30,
    ]);
  });
});

describe('suppressSmallCount', () => {
  it.each([
    [0, 0],
    [1, { suppressed: true }],
    [4, { suppressed: true }],
    [5, 5],
  ])('answers %i as %p', (inputCount, expected) => {
    expect(suppressSmallCount(inputCount)).toEqual(expected);
  });
});
