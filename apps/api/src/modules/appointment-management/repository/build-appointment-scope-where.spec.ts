import { buildAppointmentScopeWhere } from './build-appointment-scope-where';

describe('buildAppointmentScopeWhere', () => {
  const inputUserId = 'user-1';

  it('returns an unrestricted where for any-scope actors', () => {
    const actualWhere = buildAppointmentScopeWhere({ userId: inputUserId, scope: 'ANY' });
    expect(actualWhere).toEqual({});
  });

  it('restricts own-scope actors to appointments they participate in', () => {
    const actualWhere = buildAppointmentScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(actualWhere).toEqual({
      OR: [
        { patient: { ownerUserId: inputUserId } },
        { doctor: { ownerUserId: inputUserId } },
      ],
    });
  });
});
