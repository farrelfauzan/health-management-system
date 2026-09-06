import { describe, expect, it } from 'vitest';

import { filterStaffUsers } from './filter-staff-users';

describe('filterStaffUsers', () => {
  it('drops an account holding the PATIENT role', () => {
    // FR-E5-09: a patient is never an approver. The API refuses one on the
    // panel; this keeps the picker from offering what would be refused.
    const actual = filterStaffUsers([
      { id: 'a', roles: [{ code: 'ADMIN' }] },
      { id: 'b', roles: [{ code: 'PATIENT' }] },
    ]);

    expect(actual.map((user) => user.id)).toEqual(['a']);
  });

  it('drops an account that is a patient as well as staff', () => {
    // A doctor who is also registered as a patient of the clinic still must
    // not be offered — the rule is about the role, not about the person.
    const actual = filterStaffUsers([
      { id: 'a', roles: [{ code: 'DOCTOR' }, { code: 'PATIENT' }] },
    ]);

    expect(actual).toEqual([]);
  });

  it('keeps an account with no roles at all', () => {
    const actual = filterStaffUsers([{ id: 'a', roles: [] }]);

    expect(actual.map((user) => user.id)).toEqual(['a']);
  });
});
