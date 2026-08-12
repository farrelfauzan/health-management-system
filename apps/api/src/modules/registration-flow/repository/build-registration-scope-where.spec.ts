import { buildRegistrationScopeWhere } from './build-registration-scope-where';

describe('buildRegistrationScopeWhere', () => {
  const inputUserId = 'user-1';

  it('returns an unrestricted where for any-scope actors', () => {
    const actualWhere = buildRegistrationScopeWhere({ userId: inputUserId, scope: 'ANY' });
    expect(actualWhere).toEqual({});
  });

  it('restricts own-scope actors to registrations of patients they own', () => {
    const actualWhere = buildRegistrationScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(actualWhere).toEqual({ patient: { ownerUserId: inputUserId } });
  });

  it('never reaches a registration through a doctor-side relationship', () => {
    const actualWhere = buildRegistrationScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(JSON.stringify(actualWhere)).not.toContain('doctor');
  });
});
