import { countAntenatalLabVisits } from '#maternal-reporting/count-antenatal-lab-visits';
import { countAntenatalMuacVisits } from '#maternal-reporting/count-antenatal-muac-visits';
import { countAntenatalVisitsByCode } from '#maternal-reporting/count-antenatal-visits-by-code';
import type { AntenatalLabTest, MonthlyKiaIndicatorDefinition } from '#maternal-reporting/types';

const ONE_MOTHER_ONCE =
  'Satu ibu dihitung sekali per pemeriksaan; hasil yang dibaca adalah hasil terakhir pada kunjungan antenatal bulan laporan.';

function buildExaminedAndPositive(
  idPrefix: string,
  label: string,
  test: AntenatalLabTest,
): MonthlyKiaIndicatorDefinition[] {
  return [
    {
      id: `${idPrefix}Examined`,
      label: `${label}: Diperiksa`,
      definition: `Ibu hamil dengan hasil laboratorium ${label} pada kunjungan antenatal bulan laporan. ${ONE_MOTHER_ONCE}`,
      compute: (source) => countAntenatalLabVisits({ source, test, outcome: 'EXAMINED' }),
    },
    {
      id: `${idPrefix}Positive`,
      label: `${label}: Positif (+)`,
      definition: `Ibu hamil yang hasil ${label} terakhirnya reaktif/positif${test === 'GLUCOSE' ? ' atau gula darah ≥ 200 mg/dL' : ''}. ${ONE_MOTHER_ONCE}`,
      compute: (source) => countAntenatalLabVisits({ source, test, outcome: 'POSITIVE' }),
    },
  ];
}

/**
 * The antenatal laboratory block of the district LB3-KIA maternal sheet
 * (P25-T15, D-040; `docs/ops/midwife-practice-research.md` §7.1), in the
 * sheet's column order. **Provisional**: recorded from one district's open
 * data, to be compared with the pilot puskesmas' form once Q11 lands.
 */
export const ANTENATAL_LAB_BLOCK_INDICATORS: readonly MonthlyKiaIndicatorDefinition[] = [
  {
    id: 'labBumilK1',
    label: 'Jumlah Bumil K1',
    definition: 'Kunjungan K1 (K1A + K1M) pada bulan laporan; sama dengan indikator K1.',
    compute: (source) => countAntenatalVisitsByCode(source, ['K1A', 'K1M']),
  },
  {
    id: 'labBumilK4',
    label: 'Jumlah Bumil K4',
    definition: 'Kunjungan K4 pada bulan laporan; sama dengan indikator K4.',
    compute: (source) => countAntenatalVisitsByCode(source, ['K4']),
  },
  {
    id: 'hbK1Examined',
    label: 'Diperiksa Hb K1',
    definition: `Ibu hamil dengan hasil Hb pada kunjungan K1A/K1M bulan laporan. ${ONE_MOTHER_ONCE}`,
    compute: (source) =>
      countAntenatalLabVisits({
        source,
        test: 'HB',
        outcome: 'EXAMINED',
        visitCodes: ['K1A', 'K1M'],
      }),
  },
  {
    id: 'hbK1AnemiaMild',
    label: 'Hb K1: Anemia (8-11 g/dL)',
    definition: 'Ibu hamil dengan Hb K1 terakhir ≥ 8 dan < 11 g/dL.',
    compute: (source) =>
      countAntenatalLabVisits({
        source,
        test: 'HB',
        outcome: 'ANEMIA_MILD',
        visitCodes: ['K1A', 'K1M'],
      }),
  },
  {
    id: 'hbK1AnemiaSevere',
    label: 'Hb K1: Anemia (<8 g/dL)',
    definition: 'Ibu hamil dengan Hb K1 terakhir < 8 g/dL.',
    compute: (source) =>
      countAntenatalLabVisits({
        source,
        test: 'HB',
        outcome: 'ANEMIA_SEVERE',
        visitCodes: ['K1A', 'K1M'],
      }),
  },
  {
    id: 'hbK4AnemiaMild',
    label: 'Hb K4: Anemia (8-11 g/dL)',
    definition: 'Ibu hamil dengan Hb pada kunjungan K4 bulan laporan ≥ 8 dan < 11 g/dL.',
    compute: (source) =>
      countAntenatalLabVisits({ source, test: 'HB', outcome: 'ANEMIA_MILD', visitCodes: ['K4'] }),
  },
  {
    id: 'hbK4AnemiaSevere',
    label: 'Hb K4: Anemia (<8 g/dL)',
    definition: 'Ibu hamil dengan Hb pada kunjungan K4 bulan laporan < 8 g/dL.',
    compute: (source) =>
      countAntenatalLabVisits({ source, test: 'HB', outcome: 'ANEMIA_SEVERE', visitCodes: ['K4'] }),
  },
  {
    id: 'kekExamined',
    label: 'KEK: Diperiksa LiLA',
    definition:
      'Ibu hamil dengan LiLA terukur pada kunjungan antenatal bulan laporan; satu ibu dihitung sekali.',
    compute: (source) => countAntenatalMuacVisits(source, 'EXAMINED'),
  },
  {
    id: 'kekPositive',
    label: 'KEK: KEK (LiLA < 23,5)',
    definition: 'Ibu hamil yang LiLA terakhirnya pada bulan laporan < 23,5 cm.',
    compute: (source) => countAntenatalMuacVisits(source, 'KEK'),
  },
  ...buildExaminedAndPositive('proteinUrine', 'Protein urin', 'PROTEIN_URINE'),
  ...buildExaminedAndPositive('glucose', 'Gula Darah (GD)', 'GLUCOSE'),
  ...buildExaminedAndPositive('hbsag', 'HBsAg', 'HBSAG'),
  ...buildExaminedAndPositive('syphilis', 'Sifilis', 'SYPHILIS'),
  ...buildExaminedAndPositive('hiv', 'HIV', 'HIV'),
];
