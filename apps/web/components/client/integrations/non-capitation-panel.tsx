'use client';

import { useAbility } from '@hms/ui';

import { NonCapitationRecapCard } from '#components/client/integrations/non-capitation-recap-card';
import { NonCapitationSettingsCard } from '#components/client/integrations/non-capitation-settings-card';
import { NonCapitationTariffsCard } from '#components/client/integrations/non-capitation-tariffs-card';

type NonCapitationPanelProps = {
  /** The clinic's previous month, `YYYY-MM` — the one the induk files next. */
  initialMonth: string;
};

/**
 * "Klaim non-kapitasi" (P25-T16): the bidan jejaring's monthly BPJS recap
 * for the induk FKTP, next to the BPJS panels. The recap first, because it
 * is what an admin opens this tab for; the induk and the tariffs under it.
 */
export function NonCapitationPanel({ initialMonth }: NonCapitationPanelProps) {
  const ability = useAbility();
  const canWrite = ability.can('write', 'BpjsNonCapitation');

  return (
    <div className="space-y-5">
      <NonCapitationRecapCard initialMonth={initialMonth} canWrite={canWrite} />
      <NonCapitationSettingsCard canWrite={canWrite} />
      <NonCapitationTariffsCard canWrite={canWrite} />
    </div>
  );
}
