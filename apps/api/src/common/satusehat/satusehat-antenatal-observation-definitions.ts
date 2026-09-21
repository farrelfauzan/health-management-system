import {
  SatusehatAntenatalObservationDefinition,
  SatusehatAntenatalObservationField,
} from './satusehat-fhir.types';

const LOINC_SYSTEM = 'http://loinc.org';
const SNOMED_SYSTEM = 'http://snomed.info/sct';

/**
 * The codings the ANC chain reports each antenatal measurement under
 * (P25-T08), in one table for the same reason
 * `satusehat-vital-sign-definitions.ts` is one: the database stores no codes,
 * so a correction is an adapter change rather than a migration, and a second
 * copy would let two senders disagree about what a fundal height is.
 *
 * Every code here is the SATUSEHAT ANC playbook's. The live gateway accepts
 * **any** well-formed LOINC or SNOMED code — it validated none of these — so
 * acceptance is not evidence that a code is right, and the playbook has
 * already been wrong about two other fields (see
 * `docs/ops/satusehat-anc-spike.md`). Re-read the playbook section before
 * changing one.
 *
 * Weight, height and blood pressure are deliberately absent: they are already
 * sent by `mapVitalSignsToObservations`, and the platform requires no
 * ANC-specific duplicate. Only the *pre-pregnancy* weight is here, because
 * that one is not a vital sign of this visit.
 */
export const SATUSEHAT_ANTENATAL_OBSERVATION_DEFINITIONS: Readonly<
  Record<SatusehatAntenatalObservationField, SatusehatAntenatalObservationDefinition>
> = {
  gravida: {
    system: LOINC_SYSTEM,
    code: '11996-6',
    display: '[#] Pregnancies',
    category: 'survey',
    unit: '{#}',
    ucumCode: '{#}',
  },
  para: {
    system: LOINC_SYSTEM,
    code: '11977-6',
    display: 'Parity',
    category: 'survey',
    unit: '{#}',
    ucumCode: '{#}',
  },
  abortus: {
    system: LOINC_SYSTEM,
    code: '69043-8',
    display: 'Abortions',
    category: 'survey',
    unit: '{#}',
    ucumCode: '{#}',
  },
  lastMenstrualPeriodDate: {
    system: LOINC_SYSTEM,
    code: '8665-2',
    display: 'Last menstrual period start date',
    category: 'survey',
  },
  estimatedDeliveryDate: {
    system: LOINC_SYSTEM,
    code: '11778-8',
    display: 'Delivery date Estimated',
    category: 'survey',
  },
  prePregnancyWeightKg: {
    system: LOINC_SYSTEM,
    code: '56077-1',
    display: 'Body weight prior to pregnancy',
    category: 'vital-signs',
    unit: 'kg',
    ucumCode: 'kg',
  },
  gestationalAgeWeeks: {
    system: LOINC_SYSTEM,
    code: '18185-9',
    display: 'Gestational age',
    category: 'survey',
    unit: 'wk',
    ucumCode: 'wk',
  },
  trimester: {
    system: LOINC_SYSTEM,
    code: '32418-6',
    display: 'Pregnancy trimester',
    category: 'survey',
  },
  muacCm: {
    system: SNOMED_SYSTEM,
    code: '284473002',
    display: 'Mid upper arm circumference',
    category: 'exam',
    unit: 'cm',
    ucumCode: 'cm',
  },
  fundalHeightCm: {
    system: LOINC_SYSTEM,
    code: '11881-0',
    display: 'Fundal height Tape measure',
    category: 'exam',
    unit: 'cm',
    ucumCode: 'cm',
  },
  bloodType: {
    system: LOINC_SYSTEM,
    code: '883-9',
    display: 'ABO group [Type] in Blood',
    category: 'laboratory',
  },
  rhesus: {
    system: LOINC_SYSTEM,
    code: '10331-7',
    display: 'Rh [Type] in Blood',
    category: 'laboratory',
  },
  fetalHeartRateBpm: {
    system: LOINC_SYSTEM,
    code: '55283-6',
    display: 'Fetal Heart rate',
    category: 'vital-signs',
    unit: 'beats/minute',
    ucumCode: '/min',
  },
  fetalHeadEngagement: {
    system: SNOMED_SYSTEM,
    code: '249111004',
    display: 'Head relative to pelvic inlet',
    category: 'exam',
  },
  estimatedFetalWeightGrams: {
    system: LOINC_SYSTEM,
    code: '89087-1',
    display: 'Fetal body weight estimated',
    category: 'exam',
    unit: 'g',
    ucumCode: 'g',
  },
  fetalPresentation: {
    system: LOINC_SYSTEM,
    code: '72155-5',
    display: 'Fetal presentation',
    category: 'exam',
  },
  fetalCount: {
    system: SNOMED_SYSTEM,
    code: '246435002',
    display: 'Number of fetuses',
    category: 'exam',
    unit: '{#}',
    ucumCode: '{#}',
  },
};

