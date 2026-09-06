import type { ImmunizationRouteValue, ImmunizationSiteValue } from '@hms/shared-types';

/** Routes in the order a klinik pratama uses them, commonest first. */
export const IMMUNIZATION_ROUTES: readonly ImmunizationRouteValue[] = [
  'IM',
  'SC',
  'ID',
  'ORAL',
  'NASAL',
] as const;

/** Sites paired left/right so the form reads the way an arm looks. */
export const IMMUNIZATION_SITES: readonly ImmunizationSiteValue[] = [
  'LEFT_ARM',
  'RIGHT_ARM',
  'LEFT_THIGH',
  'RIGHT_THIGH',
  'OTHER',
] as const;
