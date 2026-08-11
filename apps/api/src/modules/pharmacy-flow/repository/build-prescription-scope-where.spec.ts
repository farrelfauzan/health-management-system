import { buildPrescriptionScopeWhere } from './build-prescription-scope-where';

describe('buildPrescriptionScopeWhere', () => {
  const inputUserId = 'user-1';

  it('returns an unrestricted where for any-scope actors', () => {
    const actualWhere = buildPrescriptionScopeWhere({ userId: inputUserId, scope: 'ANY' });
    expect(actualWhere).toEqual({});
  });

  it('restricts own-scope actors to prescriptions they participate in', () => {
    const actualWhere = buildPrescriptionScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(actualWhere).toEqual({
      OR: [
        { patient: { ownerUserId: inputUserId } },
        { doctor: { ownerUserId: inputUserId } },
      ],
    });
  });
});
