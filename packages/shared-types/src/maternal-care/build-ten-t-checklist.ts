import type {
  AntenatalExaminationRow,
  TenTChecklistItem,
  TenTChecklistSources,
} from '#maternal-care/types';

/**
 * The integrated 10T standard as a checklist over the record that already
 * exists (P25-T07, FR-ANC-03).
 *
 * Nothing here is a second copy of a measurement. Weight, height and blood
 * pressure are read from the encounter's vitals, the tetanus dose from an
 * `Immunization`, the tests from a lab order, the iron from a prescription —
 * so a midwife who recorded a blood pressure in the usual place does not have
 * to record it again to tick a box, and the two can never disagree.
 *
 * "Done" is deliberately shallow: it asks whether the thing was recorded, not
 * whether it was normal. Judging the value is the referral rules' job.
 */
export function buildTenTChecklist(params: {
  examination: AntenatalExaminationRow | null;
  sources: TenTChecklistSources;
}): TenTChecklistItem[] {
  const { examination, sources } = params;

  return [
    {
      code: 'WEIGHT_AND_HEIGHT',
      source: 'VITAL_SIGNS',
      isDone: sources.hasWeightAndHeight,
    },
    { code: 'BLOOD_PRESSURE', source: 'VITAL_SIGNS', isDone: sources.hasBloodPressure },
    {
      code: 'MUAC',
      source: 'EXAMINATION',
      isDone: examination !== null && examination.muacCm !== null,
    },
    {
      code: 'FUNDAL_HEIGHT',
      source: 'EXAMINATION',
      isDone: examination !== null && examination.fundalHeightCm !== null,
    },
    {
      code: 'FETAL_PRESENTATION_AND_HEART_RATE',
      source: 'EXAMINATION',
      // Both, because one without the other does not answer the standard's
      // item: a presentation with no heart rate says how she lies, not that
      // she is alive.
      isDone:
        examination !== null &&
        examination.fetalPresentation !== null &&
        examination.fetalHeartRateBpm !== null,
    },
    { code: 'TETANUS_IMMUNIZATION', source: 'IMMUNIZATION', isDone: sources.hasImmunization },
    {
      code: 'IRON_TABLETS',
      source: 'PRESCRIPTION',
      // Either the prescription or the count handed over: a clinic that gives
      // the tablets across the counter does not always write a resep for them.
      isDone:
        sources.hasIronPrescription ||
        (examination !== null &&
          examination.ironTabletsGiven !== null &&
          examination.ironTabletsGiven > 0),
    },
    { code: 'LABORATORY', source: 'LAB_ORDER', isDone: sources.hasLabOrder },
    {
      code: 'CASE_MANAGEMENT',
      source: 'EXAMINATION',
      isDone: examination !== null && examination.caseManagementNotes !== null,
    },
    {
      code: 'COUNSELLING',
      source: 'EXAMINATION',
      isDone: examination !== null && examination.counsellingTopics.length > 0,
    },
  ];
}
