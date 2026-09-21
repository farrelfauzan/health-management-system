import type { ContraceptiveMethodValue } from '#maternal-care/family-planning-schemas';
import type { FamilyPlanningAuthorityGate } from '#maternal-care/family-planning-types';

/**
 * The methods a midwife may start only with the `IUD_IMPLANT` authority
 * (P25-T14, building on P25-T03). AKDR and implant are delegated, not own,
 * authority: Permenkes 28/2017 Pasal 25(1)(a), kept as the reference by
 * Permenkes 13/2025 Pasal 305(1), and PP 28/2024 Pasal 744(2)(b).
 *
 * IUD maps to 69.7 "Insertion of contraceptive device", the same code the
 * procedure gate uses. An implant has no ICD-9-CM code (P25-T01 research §4),
 * so no mandate can name it and only her own authority covers it.
 */
export const FAMILY_PLANNING_AUTHORITY_GATES: Readonly<
  Partial<Record<ContraceptiveMethodValue, FamilyPlanningAuthorityGate>>
> = {
  IUD: { kind: 'IUD_IMPLANT', procedureCode: '69.7' },
  IMPLANT: { kind: 'IUD_IMPLANT', procedureCode: null },
};
