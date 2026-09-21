import {
  SatusehatPostnatalObservationDefinition,
  SatusehatPostnatalObservationField,
} from './satusehat-fhir.types';

const LOINC_SYSTEM = 'http://loinc.org';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const CLINICAL_TERM_SYSTEM = 'http://terminology.kemkes.go.id/CodeSystem/clinical-term';

/**
 * The codings the PNC chain reports each nifas finding under (P25-T12), in one
 * table like `satusehat-antenatal-observation-definitions.ts`: the database
 * stores no codes, so a correction is an adapter change, not a migration.
 *
 * Every code and answer is the SATUSEHAT PNC playbook's, and each was posted
 * to the staging sandbox and accepted — see `docs/ops/satusehat-pnc-spike.md`.
 * Unlike the ANC LOINC codes, the `clinical-term` ones are **validated**: the
 * sandbox refuses an unknown `OC…` code and an unknown `OV…` answer.
 *
 * Blood pressure, pulse, temperature and respiration are absent: they go out
 * as the encounter's vital signs, under the same LOINC codes the playbook
 * lists. Vitamin A and the two counselling flags are absent too — the
 * playbook gives no Observation coding for vitamin A, and counselling is a
 * Procedure there; both stay local until they are probed.
 */
export const SATUSEHAT_POSTNATAL_OBSERVATION_DEFINITIONS: Readonly<
  Record<SatusehatPostnatalObservationField, SatusehatPostnatalObservationDefinition>
> = {
  deliveryDate: {
    system: LOINC_SYSTEM,
    code: '93857-1',
    display: 'Date and time of obstetric delivery',
    category: 'survey',
  },
  vaginalBleeding: {
    system: SNOMED_SYSTEM,
    code: '289530006',
    display: 'Vaginal bleeding',
    category: 'exam',
  },
  bloodLossMl: {
    system: LOINC_SYSTEM,
    code: '81661-1',
    display: 'Blood Loss [Volume] Measured',
    category: 'exam',
    unit: 'mL',
    ucumCode: 'mL',
  },
  perineumCondition: {
    system: SNOMED_SYSTEM,
    code: '364297003',
    display: 'Female perineum observable',
    category: 'exam',
  },
  perinealInfectionSigns: {
    system: CLINICAL_TERM_SYSTEM,
    code: 'OC000020',
    display: 'Tanda Infeksi Perineum',
    category: 'exam',
  },
  caesareanWoundInfectionSigns: {
    system: CLINICAL_TERM_SYSTEM,
    code: 'OC000025',
    display: 'Tanda Infeksi Luka Jahitan Sectio Caesaria',
    category: 'exam',
  },
  breastCondition: {
    system: LOINC_SYSTEM,
    code: '32422-8',
    display: 'Physical findings of breast',
    category: 'exam',
    answers: {
      NORMAL: { system: SNOMED_SYSTEM, code: '290084006', display: 'Breast normal' },
      SWELLING: { system: SNOMED_SYSTEM, code: '300885006', display: 'Swelling of breast' },
      REDNESS: { system: SNOMED_SYSTEM, code: '290070001', display: 'Red breast' },
      NIPPLE_DISCHARGE: { system: SNOMED_SYSTEM, code: '54302000', display: 'Discharge from nipple' },
      PAIN: { system: SNOMED_SYSTEM, code: '53430007', display: 'Pain of breast' },
    },
  },
  uterineContraction: {
    system: SNOMED_SYSTEM,
    code: '289700000',
    display: 'Uterine contractions present',
    category: 'exam',
  },
  lochiaColour: {
    system: SNOMED_SYSTEM,
    code: '249214003',
    display: 'Color of lochia',
    category: 'exam',
    answers: {
      RUBRA: { system: SNOMED_SYSTEM, code: '278072004', display: 'Lochia rubra' },
      SEROSA: { system: SNOMED_SYSTEM, code: '449828001', display: 'Lochia serosa' },
      ALBA: { system: SNOMED_SYSTEM, code: '449827006', display: 'Lochia alba' },
    },
  },
  lochiaOdour: {
    system: SNOMED_SYSTEM,
    code: '249215002',
    display: 'Odor of lochia',
    category: 'exam',
  },
  breastMilkProduction: {
    system: CLINICAL_TERM_SYSTEM,
    code: 'OC000017',
    display: 'Produksi ASI',
    category: 'exam',
    answers: {
      PRESENT: { system: CLINICAL_TERM_SYSTEM, code: 'OV000016', display: 'Produksi ASI ada' },
      LOW: { system: CLINICAL_TERM_SYSTEM, code: 'OV000017', display: 'Produksi ASI ada tapi sedikit' },
      ABSENT: { system: CLINICAL_TERM_SYSTEM, code: 'OV000018', display: 'Produksi ASI tidak ada' },
    },
  },
  urination: {
    system: SNOMED_SYSTEM,
    code: '102834005',
    display: 'Normal micturition',
    category: 'exam',
  },
  defecation: {
    system: SNOMED_SYSTEM,
    code: '300375001',
    display: 'Able to defecate',
    category: 'exam',
  },
};
