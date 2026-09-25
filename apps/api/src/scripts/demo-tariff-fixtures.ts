import { DemoTariffFixture } from './seed-demo.types';

/**
 * The non-lab prices the demo bills, beyond what the base seed already has
 * (`KONSULTASI-UMUM`, the clinic-wide consultation fallback).
 *
 * A PROCEDURE with an ICD-9-CM code is collected onto the invoice on its own
 * when the clinician records that code; one without a code (pil KB, implan,
 * administrasi) is added by the cashier on the DRAFT invoice. The code
 * choices follow `docs/ops/midwife-practice-research.md` §4: `69.7` is the
 * IUD insertion code, `99.24` "Injection of other hormone" is the
 * injectable-contraceptive code a midwife uses on her own authority, and
 * implants have no ICD-9-CM code at all. `73.59` "Other manually assisted
 * delivery" is the code Indonesian coders use for a spontaneous delivery, and
 * `89.26` "Gynecological examination" is the ANC examination here — a demo
 * mapping the clinic should confirm with its own coders.
 *
 * Found again by code on a re-run; a code already priced under another tariff
 * code is left alone rather than duplicated (the column is unique).
 */
export const DEMO_TARIFF_FIXTURES: readonly DemoTariffFixture[] = [
  {
    code: 'KONSULTASI-BIDAN',
    name: 'Pemeriksaan oleh Bidan',
    category: 'CONSULTATION',
    profession: 'MIDWIFE',
    price: 35000,
  },
  {
    code: 'KIA-ANC',
    name: 'Pemeriksaan Kehamilan (ANC)',
    category: 'PROCEDURE',
    icd9cmCode: '89.26',
    price: 75000,
  },
  {
    code: 'KB-SUNTIK',
    name: 'Pelayanan KB Suntik',
    category: 'PROCEDURE',
    icd9cmCode: '99.24',
    price: 35000,
  },
  { code: 'KB-PIL', name: 'Pelayanan KB Pil', category: 'PROCEDURE', price: 20000 },
  {
    code: 'KB-IMPLAN',
    name: 'Pemasangan Implan KB',
    category: 'PROCEDURE',
    price: 250000,
  },
  {
    code: 'KB-IUD',
    name: 'Pemasangan IUD (AKDR)',
    category: 'PROCEDURE',
    icd9cmCode: '69.7',
    price: 350000,
  },
  {
    code: 'PERSALINAN-NORMAL',
    name: 'Persalinan Normal',
    category: 'PROCEDURE',
    icd9cmCode: '73.59',
    price: 1500000,
  },
  { code: 'ADMINISTRASI', name: 'Administrasi', category: 'OTHER', price: 10000 },
];
