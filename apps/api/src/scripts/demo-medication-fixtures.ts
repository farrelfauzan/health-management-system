import { DemoMedicationFixture } from './seed-demo.types';

/**
 * Two catalog items a midwife may write. The base seed's eight medications
 * are all doctor-only (`is_midwife_prescribable = false`), so without these a
 * bidan's prescription is refused whatever she picks. Both are inside her own
 * authority (Permenkes 28/2017 Pasal 19(3)(e) and Pasal 21(b)), and the KFA
 * codes are the first product codes the seeded midwife formulary lists for
 * `FE_PREGNANCY` and `INJECTABLE_3_MONTH`.
 */
export const DEMO_MEDICATION_FIXTURES: readonly DemoMedicationFixture[] = [
  {
    code: 'DEMO-FE-ASFOL',
    kfaCode: '93015491',
    name: 'Tablet Tambah Darah (Fe + Asam Folat)',
    form: 'Tablet',
    strength: '60 mg / 0,4 mg',
    unit: 'TABLET',
    unitPrice: 500,
  },
  {
    code: 'DEMO-DMPA-150',
    kfaCode: '93025649',
    name: 'Suntik KB 3 Bulan (DMPA)',
    form: 'Suspensi injeksi',
    strength: '150 mg/mL',
    unit: 'VIAL',
    unitPrice: 25000,
  },
];
