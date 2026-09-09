'use client';

import { ClinicProfileSettingsCard } from '#components/client/settings/clinic-profile-settings-card';
import { SettingsHubCard } from '#components/client/settings/settings-hub-card';
import { findSettingsHubCard, type SettingsHubCardKey } from '#lib/settings/settings-hub-cards';

type SettingsHubGridProps = {
  /** The cards the server decided this person may open, in hub order. */
  cardKeys: SettingsHubCardKey[];
};

/**
 * The card grid of `/admin/settings` (SJ-156). Which cards appear was decided
 * on the server from the session's abilities and feature entitlements; this
 * only lays them out, and hands the clinic profile card its live query.
 */
export function SettingsHubGrid({ cardKeys }: SettingsHubGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cardKeys.map((cardKey) => {
        const card = findSettingsHubCard(cardKey);
        if (card === undefined) {
          return null;
        }
        if (card.key === 'clinicProfile') {
          return <ClinicProfileSettingsCard key={card.key} href={card.href} icon={card.icon} />;
        }
        return (
          <SettingsHubCard key={card.key} cardKey={card.key} href={card.href} icon={card.icon} />
        );
      })}
    </div>
  );
}
