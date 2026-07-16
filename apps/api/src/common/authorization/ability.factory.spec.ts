import { AbilityFactory } from './ability.factory';

describe('AbilityFactory', () => {
  let abilityFactory: AbilityFactory;

  beforeEach(() => {
    abilityFactory = new AbilityFactory();
  });

  it('grants manage all when manage/all permission exists', () => {
    const ability = abilityFactory.createForPermissions([
      {
        action: 'manage',
        resource: 'all',
        scope: 'ANY',
      },
    ]);

    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('adds ownership condition for OWN scope permissions', () => {
    const ability = abilityFactory.createForPermissions([
      {
        action: 'read',
        resource: 'Appointment',
        scope: 'OWN',
      },
    ]);

    expect(ability.rules[0]).toMatchObject({
      action: 'read',
      subject: 'Appointment',
      conditions: { ownerId: '__current_user__' },
    });
  });
});
