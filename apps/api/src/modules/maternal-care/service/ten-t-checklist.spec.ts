import {
  ANTENATAL_REFERRAL_RULES,
  buildTenTChecklist,
  resolveTriggeredReferralRules,
  type AntenatalExaminationRow,
  type TenTChecklistSources,
  type TenTItemCode,
} from '@hms/shared-types';

const EMPTY_SOURCES: TenTChecklistSources = {
  hasWeightAndHeight: false,
  hasBloodPressure: false,
  hasImmunization: false,
  hasLabOrder: false,
  hasIronPrescription: false,
};

const EMPTY_EXAMINATION: AntenatalExaminationRow = {
  id: 'examination-1',
  antenatalVisitId: 'visit-1',
  muacCm: null,
  fundalHeightCm: null,
  fetalHeartRateBpm: null,
  fetalPresentation: null,
  fetalHeadEngagement: null,
  fetalCount: null,
  estimatedFetalWeightGrams: null,
  tetanusStatus: null,
  ironTabletsGiven: null,
  counsellingTopics: [],
  caseManagementNotes: null,
};

function findItem(
  checklist: ReturnType<typeof buildTenTChecklist>,
  code: TenTItemCode,
): { isDone: boolean; source: string } {
  const item = checklist.find((entry) => entry.code === code);
  if (item === undefined) {
    throw new Error(`Checklist is missing ${code}`);
  }
  return item;
}

describe('buildTenTChecklist', () => {
  it('lists all ten items even when nothing has been recorded', () => {
    const actual = buildTenTChecklist({ examination: null, sources: EMPTY_SOURCES });

    expect(actual).toHaveLength(10);
    expect(actual.every((item) => !item.isDone)).toBe(true);
  });

  it('reads weight, height and blood pressure from the vitals, not the examination', () => {
    const actual = buildTenTChecklist({
      examination: EMPTY_EXAMINATION,
      sources: { ...EMPTY_SOURCES, hasWeightAndHeight: true, hasBloodPressure: true },
    });

    expect(findItem(actual, 'WEIGHT_AND_HEIGHT')).toMatchObject({
      isDone: true,
      source: 'VITAL_SIGNS',
    });
    expect(findItem(actual, 'BLOOD_PRESSURE')).toMatchObject({
      isDone: true,
      source: 'VITAL_SIGNS',
    });
  });

  it('marks LiLA and fundal height done from the examination row', () => {
    const actual = buildTenTChecklist({
      examination: { ...EMPTY_EXAMINATION, muacCm: 24.5, fundalHeightCm: 28 },
      sources: EMPTY_SOURCES,
    });

    expect(findItem(actual, 'MUAC').isDone).toBe(true);
    expect(findItem(actual, 'FUNDAL_HEIGHT').isDone).toBe(true);
  });

  it('needs both the presentation and the heart rate for that item', () => {
    const presentationOnly = buildTenTChecklist({
      examination: { ...EMPTY_EXAMINATION, fetalPresentation: 'CEPHALIC' },
      sources: EMPTY_SOURCES,
    });
    const both = buildTenTChecklist({
      examination: {
        ...EMPTY_EXAMINATION,
        fetalPresentation: 'CEPHALIC',
        fetalHeartRateBpm: 148,
      },
      sources: EMPTY_SOURCES,
    });

    expect(findItem(presentationOnly, 'FETAL_PRESENTATION_AND_HEART_RATE').isDone).toBe(false);
    expect(findItem(both, 'FETAL_PRESENTATION_AND_HEART_RATE').isDone).toBe(true);
  });

  it('accepts iron from the prescription or from the count handed over', () => {
    const fromPrescription = buildTenTChecklist({
      examination: EMPTY_EXAMINATION,
      sources: { ...EMPTY_SOURCES, hasIronPrescription: true },
    });
    const fromCounter = buildTenTChecklist({
      examination: { ...EMPTY_EXAMINATION, ironTabletsGiven: 30 },
      sources: EMPTY_SOURCES,
    });
    const noneGiven = buildTenTChecklist({
      examination: { ...EMPTY_EXAMINATION, ironTabletsGiven: 0 },
      sources: EMPTY_SOURCES,
    });

    expect(findItem(fromPrescription, 'IRON_TABLETS').isDone).toBe(true);
    expect(findItem(fromCounter, 'IRON_TABLETS').isDone).toBe(true);
    expect(findItem(noneGiven, 'IRON_TABLETS').isDone).toBe(false);
  });

  it('reads the tetanus dose and the tests from their own records', () => {
    const actual = buildTenTChecklist({
      examination: EMPTY_EXAMINATION,
      sources: { ...EMPTY_SOURCES, hasImmunization: true, hasLabOrder: true },
    });

    expect(findItem(actual, 'TETANUS_IMMUNIZATION')).toMatchObject({
      isDone: true,
      source: 'IMMUNIZATION',
    });
    expect(findItem(actual, 'LABORATORY')).toMatchObject({ isDone: true, source: 'LAB_ORDER' });
  });

  it('counts counselling as done once a topic is recorded', () => {
    const actual = buildTenTChecklist({
      examination: { ...EMPTY_EXAMINATION, counsellingTopics: ['Tanda bahaya kehamilan'] },
      sources: EMPTY_SOURCES,
    });

    expect(findItem(actual, 'COUNSELLING').isDone).toBe(true);
  });
});

describe('ANTENATAL_REFERRAL_RULES', () => {
  /**
   * The list is empty on purpose (P25-T07): the Pedoman Pelayanan Antenatal
   * Terpadu could not be read from a primary source, and a threshold that
   * sends a mother to a hospital is not taken from a summary. This spec is the
   * guard for when rules do arrive.
   */
  it('cites a source for every rule', () => {
    expect(
      ANTENATAL_REFERRAL_RULES.every((rule) => rule.source.trim().length > 0),
    ).toBe(true);
  });

  it('gives every rule a distinct code', () => {
    const codes = ANTENATAL_REFERRAL_RULES.map((rule) => rule.code);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('resolveTriggeredReferralRules', () => {
  const input = {
    gestationalAge: { weeks: 29, days: 0 },
    systolicBloodPressure: 150,
    diastolicBloodPressure: 95,
    muacCm: 22,
    haemoglobinGramsPerDecilitre: null,
    fetalHeartRateBpm: 148,
    fetalPresentation: 'BREECH' as const,
  };

  it('fires nothing while the rule list is empty, whatever the findings', () => {
    const actual = resolveTriggeredReferralRules({ input, dismissedReasonsByRuleCode: {} });

    expect(actual).toEqual([]);
  });
});
