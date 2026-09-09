import { buildAppAbility, type AppRule } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { resolveVisibleSettingsHubCards, SETTINGS_HUB_CARDS } from './settings-hub-cards';

function resolveKeys(rules: AppRule[], disabledNavHrefs: string[] = []): string[] {
  return resolveVisibleSettingsHubCards({
    ability: buildAppAbility(rules),
    disabledNavHrefs,
  }).map((card) => card.key);
}

/**
 * SJ-156. The hub shows an operator only the settings they may change, and
 * drops a card whose destination a disabled feature has already taken away.
 */
describe('resolveVisibleSettingsHubCards', () => {
  it('shows every card to a super-admin', () => {
    const actual = resolveKeys([{ action: 'manage', subject: 'all' }]);

    expect(actual).toEqual(SETTINGS_HUB_CARDS.map((card) => card.key));
  });

  it('withholds the clinic profile card from somebody who may only read it', () => {
    const actual = resolveKeys([
      { action: 'read', subject: 'ClinicProfile' },
      { action: 'write', subject: 'ServiceTariff' },
    ]);

    expect(actual).toEqual(['serviceTariffs']);
  });

  it('opens the laboratory card on either of its write keys', () => {
    expect(resolveKeys([{ action: 'write', subject: 'LaboratorySettings' }])).toEqual([
      'laboratory',
    ]);
    expect(resolveKeys([{ action: 'write', subject: 'LabTest' }])).toEqual(['laboratory']);
  });

  it('opens the doctor credential catalog for whoever may edit a doctor', () => {
    expect(resolveKeys([{ action: 'update', subject: 'Doctor' }])).toEqual(['doctorCredentials']);
    expect(resolveKeys([{ action: 'read', subject: 'Doctor' }])).toEqual([]);
  });

  it('drops a card whose destination a disabled feature has removed', () => {
    const actual = resolveKeys(
      [
        { action: 'write', subject: 'LabTest' },
        { action: 'write', subject: 'ClinicProfile' },
      ],
      ['/admin/settings/laboratory', '/admin/laboratory'],
    );

    expect(actual).toEqual(['clinicProfile']);
  });

  it('matches a disabled route against the card path, ignoring its tab query', () => {
    const actual = resolveKeys([{ action: 'write', subject: 'ServiceTariff' }], ['/admin/billing']);

    expect(actual).toEqual([]);
  });

  it('shows nothing to a bench account with read keys only', () => {
    const actual = resolveKeys([
      { action: 'read', subject: 'LabTest' },
      { action: 'read', subject: 'LaboratorySettings' },
      { action: 'read', subject: 'ClinicProfile' },
    ]);

    expect(actual).toEqual([]);
  });
});
