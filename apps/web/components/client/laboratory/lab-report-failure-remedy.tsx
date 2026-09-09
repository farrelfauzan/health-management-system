'use client';

import type { LabReportConfigurationFailureCode } from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { resolveLabReportFailureRemedy } from '#lib/laboratory/resolve-lab-report-failure-remedy';

type LabReportFailureRemedyProps = {
  code: LabReportConfigurationFailureCode;
};

/**
 * What a version parked by a missing setting says (`P18-T16`): the setting,
 * in words, and the way to it. "Retry" alone sends the bench to IT; the
 * clinic profile is a form an administrator fills in a minute, once they know
 * that is what the report is waiting on. The link is withheld from somebody
 * who may not change the setting — they are told whom to ask instead.
 */
export function LabReportFailureRemedy({ code }: LabReportFailureRemedyProps) {
  const t = useTranslations('operations.laboratory.reports');
  const ability = useAbility();
  const remedy = resolveLabReportFailureRemedy(code);
  const canFix = ability.can(remedy.ability.action, remedy.ability.subject);

  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="lab-report-remedy">
      <span className="text-red-700">{t(`configurationFailures.${code}`)}</span>
      {canFix ? (
        <Button asChild type="button" size="sm" variant="outline">
          <Link href={remedy.href}>
            <Icon name="settings" size={15} />
            {t(`fixSetting.${code}`)}
          </Link>
        </Button>
      ) : (
        <span className="text-slate-500">{t('askAdministrator')}</span>
      )}
    </span>
  );
}
