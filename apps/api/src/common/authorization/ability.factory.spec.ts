import { OFFBOARDED_PERMISSION_KEYS } from '@hms/shared-types';

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

  describe('offboarded branch (P16-T41)', () => {
    it('grants read and delete on the own vault and nothing else', () => {
      const ability = abilityFactory.createForOffboardedUser();

      expect(ability.can('read', 'VaultDocument')).toBe(true);
      expect(ability.can('delete', 'VaultDocument')).toBe(true);
      // No filing, no editing, and above all no new shares: resignation
      // opens no doors for anyone.
      expect(ability.can('write', 'VaultDocument')).toBe(false);
      expect(ability.can('share', 'VaultDocument')).toBe(false);
      expect(ability.can('read', 'Patient')).toBe(false);
      expect(ability.can('read', 'Encounter')).toBe(false);
      expect(ability.can('manage', 'all')).toBe(false);
    });

    it('scopes both rules to the caller', () => {
      const ability = abilityFactory.createForOffboardedUser();

      for (const rule of ability.rules) {
        expect(rule.conditions).toEqual({ ownerId: '__current_user__' });
      }
    });

    it('mirrors the reduced key list the session claims carry', () => {
      // Two copies of one fact — the API's rules here, the web's claims from
      // `OFFBOARDED_PERMISSION_KEYS` — kept in step by this assertion, so the
      // sidebar never shows what the guard would refuse or hides what it
      // would allow.
      const ability = abilityFactory.createForOffboardedUser();
      const expectedPairs = OFFBOARDED_PERMISSION_KEYS.map((permissionKey) => {
        const [resourceAndAction] = permissionKey.split(':');
        const [resource, action] = resourceAndAction!.split('.');
        return `${action}:${resource}`;
      }).sort();
      const actualPairs = ability.rules
        .map((rule) =>
          `${String(rule.action)}:${String(rule.subject)}`.replace(
            'VaultDocument',
            'vault-document',
          ),
        )
        .sort();

      expect(actualPairs).toEqual(expectedPairs);
    });
  });
});
