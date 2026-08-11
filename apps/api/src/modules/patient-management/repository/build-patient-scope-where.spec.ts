import { buildPatientScopeWhere } from './build-patient-scope-where';

describe('buildPatientScopeWhere', () => {
  const inputUserId = 'user-1';

  it('returns an unrestricted where for any-scope actors under care ownership', () => {
    const actualWhere = buildPatientScopeWhere({
      actor: { userId: inputUserId, scope: 'ANY' },
      ownership: 'CARE',
    });
    expect(actualWhere).toEqual({});
  });

  it('returns an unrestricted where for any-scope actors under self ownership', () => {
    const actualWhere = buildPatientScopeWhere({
      actor: { userId: inputUserId, scope: 'ANY' },
      ownership: 'SELF',
    });
    expect(actualWhere).toEqual({});
  });

  it('restricts own-scope self ownership to the owning user only', () => {
    const actualWhere = buildPatientScopeWhere({
      actor: { userId: inputUserId, scope: 'OWN' },
      ownership: 'SELF',
    });
    expect(actualWhere).toEqual({ ownerUserId: inputUserId });
  });

  it('extends own-scope care ownership to actively assigned doctors', () => {
    const actualWhere = buildPatientScopeWhere({
      actor: { userId: inputUserId, scope: 'OWN' },
      ownership: 'CARE',
    });
    expect(actualWhere).toEqual({
      OR: [
        { ownerUserId: inputUserId },
        {
          doctors: {
            some: {
              unassignedAt: null,
              doctor: {
                ownerUserId: inputUserId,
                deletedAt: null,
                isActive: true,
              },
            },
          },
        },
      ],
    });
  });

  it('never widens self ownership through a doctor assignment', () => {
    const actualWhere = buildPatientScopeWhere({
      actor: { userId: inputUserId, scope: 'OWN' },
      ownership: 'SELF',
    });
    expect(JSON.stringify(actualWhere)).not.toContain('doctors');
  });
});
