/**
 * What the staging sandbox accepted in the P25-T12 PNC probe (2026-09-21),
 * recorded so the mapper can be pinned to it — see
 * `docs/ops/satusehat-pnc-spike.md`. Identifiers are scrubbed: `<org>` is the
 * organization id and `<ihs>` the patient; the mapper spec substitutes its own.
 *
 * Each entry is one accepted resource or element, verbatim apart from those
 * placeholders.
 */
export const SATUSEHAT_PNC_PROBE_FIXTURES = {
  /** `POST /EpisodeOfCare` → 201. */
  episodeOfCareType: {
    system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type',
    code: 'PNC',
    display: 'Postnatal Care',
  },
  episodeOfCareIdentifierSystem: 'http://sys-ids.kemkes.go.id/episode-of-care/<org>',
  /** The KF identifier an accepted PNC Encounter read back with. */
  kfIdentifier: {
    system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/puerperium',
    value: 'KF2',
  },
  /** The KN identifier an accepted neonatal Encounter carried. */
  knIdentifier: {
    system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/neonate',
    value: 'KN1',
  },
  /** Each nifas Observation's `code.coding[0]` and value element, all accepted (200). */
  observations: [
    {
      code: { system: 'http://loinc.org', code: '93857-1', display: 'Date and time of obstetric delivery' },
      value: { valueDateTime: '2026-09-11T08:00:00.000Z' },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '289530006', display: 'Vaginal bleeding' },
      value: { valueBoolean: false },
    },
    {
      code: { system: 'http://loinc.org', code: '81661-1', display: 'Blood Loss [Volume] Measured' },
      value: { valueQuantity: { value: 50, unit: 'mL', system: 'http://unitsofmeasure.org', code: 'mL' } },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '364297003', display: 'Female perineum observable' },
      value: { valueString: 'Jahitan utuh, tidak bengkak' },
    },
    {
      code: {
        system: 'http://terminology.kemkes.go.id/CodeSystem/clinical-term',
        code: 'OC000020',
        display: 'Tanda Infeksi Perineum',
      },
      value: { valueBoolean: false },
    },
    {
      code: {
        system: 'http://terminology.kemkes.go.id/CodeSystem/clinical-term',
        code: 'OC000025',
        display: 'Tanda Infeksi Luka Jahitan Sectio Caesaria',
      },
      value: { valueBoolean: false },
    },
    {
      code: { system: 'http://loinc.org', code: '32422-8', display: 'Physical findings of breast' },
      value: {
        valueCodeableConcept: {
          coding: [{ system: 'http://snomed.info/sct', code: '290084006', display: 'Breast normal' }],
        },
      },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '289700000', display: 'Uterine contractions present' },
      value: { valueBoolean: true },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '249214003', display: 'Color of lochia' },
      value: {
        valueCodeableConcept: {
          coding: [{ system: 'http://snomed.info/sct', code: '449828001', display: 'Lochia serosa' }],
        },
      },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '249215002', display: 'Odor of lochia' },
      value: { valueBoolean: false },
    },
    {
      code: {
        system: 'http://terminology.kemkes.go.id/CodeSystem/clinical-term',
        code: 'OC000017',
        display: 'Produksi ASI',
      },
      value: {
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.kemkes.go.id/CodeSystem/clinical-term',
              code: 'OV000016',
              display: 'Produksi ASI ada',
            },
          ],
        },
      },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '102834005', display: 'Normal micturition' },
      value: { valueBoolean: true },
    },
    {
      code: { system: 'http://snomed.info/sct', code: '300375001', display: 'Able to defecate' },
      value: { valueBoolean: true },
    },
  ],
} as const;
