import type { TenTItemCode } from '@hms/shared-types';

/**
 * The ten items in the order the integrated standard lists them, which is also
 * the order a midwife works through a visit: measure, then examine, then give,
 * then talk.
 */
export const TEN_T_ITEM_ORDER: readonly TenTItemCode[] = [
  'WEIGHT_AND_HEIGHT',
  'BLOOD_PRESSURE',
  'MUAC',
  'FUNDAL_HEIGHT',
  'FETAL_PRESENTATION_AND_HEART_RATE',
  'TETANUS_IMMUNIZATION',
  'IRON_TABLETS',
  'LABORATORY',
  'CASE_MANAGEMENT',
  'COUNSELLING',
];
