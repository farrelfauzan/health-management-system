import type { AppAbility, AppAction, AppSubject } from '@hms/ui';

export type SettingsHubCardKey =
  | 'clinicProfile'
  | 'serviceTariffs'
  | 'laboratory'
  | 'doctorCredentials'
  | 'documentTemplates'
  | 'integrations'
  | 'aiProviders'
  | 'roles';

export type SettingsHubAbility = { action: AppAction; subject: AppSubject };

export type SettingsHubCard = {
  key: SettingsHubCardKey;
  /** Where the setting lives today. Link, never relocate (SJ-156). */
  href: string;
  icon: string;
  /** Any one of these opens the card — the ability that lets a person change the setting. */
  abilities: readonly SettingsHubAbility[];
};

/**
 * The configuration areas the hub points at (SJ-156), in the order an
 * administrator setting a clinic up meets them. Every href is a screen that
 * already exists; this table is discovery, not a migration, and the ticket's
 * relocation under `/admin/settings/*` is a follow-up once the grouping has
 * proved right.
 *
 * Gates are the write-level ability of each destination, so an operator sees
 * only what they may change — with one deliberate exception: roles is gated on
 * `read`, because an ADMIN may read the matrix and assign roles while only a
 * super-admin may mint one, and a card they can open is still worth showing.
 *
 * Absent by design: a feature-entitlements card. The API owns entitlements,
 * but no screen in this app edits them yet, so there is nothing to link.
 */
export const SETTINGS_HUB_CARDS: readonly SettingsHubCard[] = [
  {
    key: 'clinicProfile',
    href: '/admin/administration?tab=clinic',
    icon: 'apartment',
    abilities: [{ action: 'write', subject: 'ClinicProfile' }],
  },
  {
    key: 'serviceTariffs',
    href: '/admin/billing?tab=tariffs',
    icon: 'sell',
    abilities: [{ action: 'write', subject: 'ServiceTariff' }],
  },
  {
    key: 'laboratory',
    href: '/admin/settings/laboratory',
    icon: 'biotech',
    abilities: [
      { action: 'write', subject: 'LabTest' },
      { action: 'write', subject: 'LaboratorySettings' },
    ],
  },
  {
    key: 'doctorCredentials',
    href: '/admin/settings/doctor-credentials',
    icon: 'badge',
    // `update` on Doctor rather than a `write` of its own (P19-T14): extending
    // the credential catalog is the same administrative act as editing a
    // doctor, and the API gates both on `doctor.update:any`.
    abilities: [{ action: 'update', subject: 'Doctor' }],
  },
  {
    key: 'documentTemplates',
    href: '/admin/billing?tab=templates',
    icon: 'description',
    abilities: [{ action: 'write', subject: 'DocumentTemplate' }],
  },
  {
    key: 'integrations',
    href: '/admin/integrations',
    icon: 'hub',
    // The two manage keys the seed defines; SATUSEHAT has no config key of
    // its own today (`satusehat.link` links records, it does not configure).
    abilities: [
      { action: 'manage', subject: 'BpjsConfig' },
      { action: 'manage', subject: 'BpjsMapping' },
    ],
  },
  {
    key: 'aiProviders',
    href: '/admin/ai-providers',
    icon: 'settings_input_component',
    abilities: [{ action: 'write', subject: 'AiProviderConfig' }],
  },
  {
    key: 'roles',
    href: '/admin/administration?tab=roles',
    icon: 'admin_panel_settings',
    abilities: [{ action: 'read', subject: 'Role' }],
  },
];

type ResolveVisibleSettingsHubCardsParams = {
  ability: AppAbility;
  /** Nav routes a disabled feature has taken away (IMP-9); a card pointing at one goes with it. */
  disabledNavHrefs: readonly string[];
};

/**
 * The cards this person may open. A card is hidden for either of the two
 * reasons a nav entry is: no ability that lets them change the setting, or
 * the feature owning the destination is off for this clinic. Visibility only
 * — every destination re-checks on render, and the API refuses regardless.
 */
export function resolveVisibleSettingsHubCards(
  params: ResolveVisibleSettingsHubCardsParams,
): SettingsHubCard[] {
  const disabledPaths = new Set(params.disabledNavHrefs);
  return SETTINGS_HUB_CARDS.filter(
    (card) =>
      !disabledPaths.has(toPathname(card.href)) &&
      card.abilities.some((requirement) =>
        params.ability.can(requirement.action, requirement.subject),
      ),
  );
}

export function findSettingsHubCard(key: SettingsHubCardKey): SettingsHubCard | undefined {
  return SETTINGS_HUB_CARDS.find((card) => card.key === key);
}

/** The disabled-route table is keyed by pathname; a card href may carry a tab query. */
function toPathname(href: string): string {
  const queryStart = href.indexOf('?');
  return queryStart === -1 ? href : href.slice(0, queryStart);
}
