import { describe, expect, it } from 'vitest';

import { parseAnalyticsFilterParams } from './parse-analytics-filter-params';
import { resolveAnalyticsPresetRange } from './resolve-analytics-preset-range';
import { toAnalyticsFilterSearchParams } from './to-analytics-filter-search-params';

const TODAY = '2026-09-28';
const POLI_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '33333333-3333-4333-8333-333333333333';

describe('resolveAnalyticsPresetRange', () => {
  it.each([
    ['today', '2026-09-28', '2026-09-28'],
    ['last-7-days', '2026-09-22', '2026-09-28'],
    ['this-month', '2026-09-01', '2026-09-30'],
    ['last-month', '2026-08-01', '2026-08-31'],
    ['last-3-months', '2026-06-29', '2026-09-28'],
    ['last-12-months', '2025-09-29', '2026-09-28'],
  ] as const)('reads %s from 28 September as %s to %s', (inputPreset, expectedFrom, expectedTo) => {
    expect(resolveAnalyticsPresetRange(inputPreset, TODAY)).toEqual({
      from: expectedFrom,
      to: expectedTo,
    });
  });

  it('gives last month as all of February from a day in March', () => {
    expect(resolveAnalyticsPresetRange('last-month', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('has no dates of its own for a custom period', () => {
    expect(resolveAnalyticsPresetRange('custom', TODAY)).toBeNull();
  });
});

describe('parseAnalyticsFilterParams', () => {
  it('opens on this month, compared, with no filters', () => {
    expect(parseAnalyticsFilterParams({}, TODAY)).toEqual({
      preset: 'this-month',
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
      specialtyId: undefined,
      doctorId: undefined,
    });
  });

  it('reads a custom period, compare off and both filters', () => {
    const actual = parseAnalyticsFilterParams(
      {
        period: 'custom',
        from: '2026-09-10',
        to: '2026-09-16',
        compare: 'false',
        poli: POLI_ID,
        doctor: DOCTOR_ID,
      },
      TODAY,
    );

    expect(actual).toEqual({
      preset: 'custom',
      from: '2026-09-10',
      to: '2026-09-16',
      compare: false,
      specialtyId: POLI_ID,
      doctorId: DOCTOR_ID,
    });
  });

  it('keeps a too-long custom range so the filter bar can say why', () => {
    const actual = parseAnalyticsFilterParams(
      { period: 'custom', from: '2024-01-01', to: '2026-09-30' },
      TODAY,
    );

    expect(actual).toMatchObject({ preset: 'custom', from: '2024-01-01', to: '2026-09-30' });
  });

  it.each([
    [{ period: 'next-decade' }],
    [{ period: 'custom', from: '2026-02-30', to: '2026-03-01' }],
    [{ period: 'custom' }],
  ])('falls back to this month on an unreadable period: %p', (inputParams) => {
    expect(parseAnalyticsFilterParams(inputParams, TODAY)).toMatchObject({
      preset: 'this-month',
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('drops a poli or doctor that is not an id', () => {
    const actual = parseAnalyticsFilterParams({ poli: "1' OR '1'='1", doctor: 'abc' }, TODAY);

    expect(actual.specialtyId).toBeUndefined();
    expect(actual.doctorId).toBeUndefined();
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseAnalyticsFilterParams({ period: ['last-month', 'today'] }, TODAY).preset).toBe(
      'last-month',
    );
  });
});

describe('toAnalyticsFilterSearchParams', () => {
  it('writes nothing for the default view', () => {
    expect(toAnalyticsFilterSearchParams(parseAnalyticsFilterParams({}, TODAY))).toBe('');
  });

  it('writes a preset without dates, because a preset is recomputed from today', () => {
    const actual = toAnalyticsFilterSearchParams({
      ...parseAnalyticsFilterParams({}, TODAY),
      preset: 'last-month',
    });

    expect(actual).toBe('period=last-month');
  });

  it('round-trips a custom view through the URL', () => {
    const inputParams = {
      period: 'custom',
      from: '2026-09-10',
      to: '2026-09-16',
      compare: 'false',
      poli: POLI_ID,
      doctor: DOCTOR_ID,
    };
    const inputState = parseAnalyticsFilterParams(inputParams, TODAY);

    const actualQuery = toAnalyticsFilterSearchParams(inputState);
    const actualState = parseAnalyticsFilterParams(
      Object.fromEntries(new URLSearchParams(actualQuery)),
      TODAY,
    );

    expect(actualState).toEqual(inputState);
  });
});
