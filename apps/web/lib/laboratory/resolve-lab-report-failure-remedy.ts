import type { LabReportConfigurationFailureCode } from '@hms/shared-types';
import type { AppAction, AppSubject } from '@hms/ui';

export type LabReportFailureRemedy = {
  /** The screen where the missing setting is filled in. */
  href: string;
  /** The ability that lets this person fill it in; without it, the link is withheld. */
  ability: { action: AppAction; subject: AppSubject };
};

/**
 * Where a configuration failure is fixed (P18-T16). Kept in the web app rather
 * than the contract, because a route is this app's knowledge: the API says
 * *which* setting is missing, and this table says where it lives today.
 */
const REMEDIES: Readonly<Record<LabReportConfigurationFailureCode, LabReportFailureRemedy>> = {
  CLINIC_PROFILE_MISSING: {
    href: '/admin/administration?tab=clinic',
    ability: { action: 'write', subject: 'ClinicProfile' },
  },
};

export function resolveLabReportFailureRemedy(
  code: LabReportConfigurationFailureCode,
): LabReportFailureRemedy {
  return REMEDIES[code];
}
