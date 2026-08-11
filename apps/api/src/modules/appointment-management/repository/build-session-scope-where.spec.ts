import { buildSessionScopeWhere } from './build-session-scope-where';

describe('buildSessionScopeWhere', () => {
  const inputUserId = 'user-1';

  it('returns an unrestricted where for any-scope actors', () => {
    const actualWhere = buildSessionScopeWhere({ userId: inputUserId, scope: 'ANY' });
    expect(actualWhere).toEqual({});
  });

  it('restricts own-scope actors to sessions of doctors they own', () => {
    const actualWhere = buildSessionScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(actualWhere).toEqual({ doctor: { ownerUserId: inputUserId } });
  });

  it('never reaches a session through a patient-side relationship', () => {
    const actualWhere = buildSessionScopeWhere({ userId: inputUserId, scope: 'OWN' });
    expect(JSON.stringify(actualWhere)).not.toContain('patient');
  });
});
