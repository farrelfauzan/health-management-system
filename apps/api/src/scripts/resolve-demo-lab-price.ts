/** What an unlisted test costs: a middle-of-the-list klinik price. */
const DEFAULT_TEST_PRICE = 30000;

/** What an unlisted panel costs. */
const DEFAULT_PANEL_PRICE = 100000;

/**
 * Demo rupiah prices for the base lab catalog, keyed by catalog code. Rough
 * Jakarta klinik pratama list prices — plausible on an invoice, not a
 * reference anyone should bill from.
 */
const PRICE_BY_CODE: Readonly<Record<string, number>> = {
  HB: 25000,
  ERI: 20000,
  LEUKO: 20000,
  TROMBO: 20000,
  HCT: 20000,
  LED: 20000,
  GOLDAR: 25000,
  GDS: 20000,
  GDP: 25000,
  GD2PP: 25000,
  HBA1C: 150000,
  KOLTOT: 40000,
  HDL: 45000,
  LDL: 50000,
  TG: 45000,
  SGOT: 40000,
  SGPT: 40000,
  BILTOT: 40000,
  UREUM: 40000,
  KREA: 40000,
  URIC: 35000,
  HBSAG: 75000,
  ANTIHIV: 100000,
  RPR: 60000,
  VDRL: 60000,
  ASO: 60000,
  WIDAL: 60000,
  NS1: 150000,
  MALARIA: 40000,
  BTA: 50000,
  HCGURIN: 35000,
  FESEDIM: 35000,
  'DARAH-RUTIN': 75000,
  'PROFIL-LIPID': 150000,
  'FUNGSI-HATI': 75000,
  'FUNGSI-GINJAL': 75000,
  'URIN-RUTIN': 40000,
};

/** Urinalysis dipstick parameters share one price. */
const URINE_PARAMETER_PREFIX = 'UR';
const URINE_PARAMETER_PRICE = 10000;

/**
 * The demo price for one catalog row. A test or panel the list does not name
 * still gets a price, so a clinic that added its own tests before seeding
 * never sees a `NO_TARIFF_FOR_LAB_TEST` gap during the demo.
 */
export function resolveDemoLabPrice(input: { code: string; kind: 'TEST' | 'PANEL' }): number {
  const listed = PRICE_BY_CODE[input.code];
  if (listed !== undefined) {
    return listed;
  }
  if (input.kind === 'PANEL') {
    return DEFAULT_PANEL_PRICE;
  }
  return input.code.startsWith(URINE_PARAMETER_PREFIX) ? URINE_PARAMETER_PRICE : DEFAULT_TEST_PRICE;
}
