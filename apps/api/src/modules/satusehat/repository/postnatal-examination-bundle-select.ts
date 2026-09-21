/** The nifas examination columns the PNC chain sends (P25-T12). */
export const POSTNATAL_EXAMINATION_BUNDLE_SELECT = {
  vaginalBleeding: true,
  bloodLossMl: true,
  perineumCondition: true,
  perinealInfectionSigns: true,
  caesareanWoundInfectionSigns: true,
  breastCondition: true,
  uterineContraction: true,
  lochiaColour: true,
  lochiaOdour: true,
  breastMilkProduction: true,
  urination: true,
  defecation: true,
  newbornCareCounselling: true,
  vitaminAGivenAt: true,
  vitaminAMedicationId: true,
  familyPlanningCounselling: true,
} as const;
