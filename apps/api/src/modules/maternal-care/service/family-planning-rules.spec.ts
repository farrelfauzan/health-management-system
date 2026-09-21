import {
  FAMILY_PLANNING_DEFAULT_INTERVAL_DAYS,
  resolveFamilyPlanningNextDueDate,
} from '@hms/shared-types';

/**
 * P25-T14. The sourced default due date per method, and the two methods that
 * never get one: a condom (nothing lapses) and IUD/implant (the clinician
 * enters the control date).
 */
describe('resolveFamilyPlanningNextDueDate (P25-T14)', () => {
  it.each([
    ['PILL', '2026-10-29'],
    ['INJECTABLE_1_MONTH', '2026-10-29'],
    ['INJECTABLE_3_MONTH', '2026-12-24'],
  ] as const)('defaults %s from its sourced interval', (method, expectedNextDueOn) => {
    // Arrange
    const inputServedOn = '2026-10-01';
    // Act
    const actualNextDueOn = resolveFamilyPlanningNextDueDate({ method, servedOn: inputServedOn });
    // Assert
    expect(actualNextDueOn).toBe(expectedNextDueOn);
  });

  it('gives Ibu Dewi her next DMPA injection 84 days after 1 October', () => {
    expect(FAMILY_PLANNING_DEFAULT_INTERVAL_DAYS.INJECTABLE_3_MONTH).toBe(84);
    expect(
      resolveFamilyPlanningNextDueDate({ method: 'INJECTABLE_3_MONTH', servedOn: '2026-10-01' }),
    ).toBe('2026-12-24');
  });

  it('gives a condom no due date, even when one is entered', () => {
    expect(resolveFamilyPlanningNextDueDate({ method: 'CONDOM', servedOn: '2026-10-01' })).toBeNull();
    expect(
      resolveFamilyPlanningNextDueDate({
        method: 'CONDOM',
        servedOn: '2026-10-01',
        enteredNextDueOn: '2026-11-01',
      }),
    ).toBeNull();
  });

  it.each(['IUD', 'IMPLANT'] as const)('does not default %s, and keeps the entered date', (method) => {
    expect(resolveFamilyPlanningNextDueDate({ method, servedOn: '2026-10-01' })).toBeNull();
    expect(
      resolveFamilyPlanningNextDueDate({
        method,
        servedOn: '2026-10-01',
        enteredNextDueOn: '2026-11-01',
      }),
    ).toBe('2026-11-01');
  });

  it('lets the clinician override the default, or clear it with null', () => {
    expect(
      resolveFamilyPlanningNextDueDate({
        method: 'INJECTABLE_3_MONTH',
        servedOn: '2026-10-01',
        enteredNextDueOn: '2026-12-20',
      }),
    ).toBe('2026-12-20');
    expect(
      resolveFamilyPlanningNextDueDate({
        method: 'PILL',
        servedOn: '2026-10-01',
        enteredNextDueOn: null,
      }),
    ).toBeNull();
  });

  it('crosses a month and a year boundary on calendar days', () => {
    expect(
      resolveFamilyPlanningNextDueDate({ method: 'INJECTABLE_3_MONTH', servedOn: '2026-12-23' }),
    ).toBe('2027-03-17');
  });
});
