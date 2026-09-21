import type { ContraceptiveMethodValue } from '#maternal-care/family-planning-schemas';

/**
 * The default number of days from a service to the next one, per method
 * (P25-T14). A default only: the clinician may change the date on every
 * start and every service, and the date she enters is the one stored.
 *
 * `null` means the method has no default:
 * - a condom has no due date at all;
 * - an IUD or an implant has a clinician-entered control date, because the
 *   control schedule depends on the device and the visit, not on a cycle.
 */
export const FAMILY_PLANNING_DEFAULT_INTERVAL_DAYS: Readonly<
  Record<ContraceptiveMethodValue, number | null>
> = {
  /**
   * One 28-tablet strip per cycle; she comes back before the strip ends.
   * Source: BKKBN & Kemenkes, *Buku Panduan Praktis Pelayanan Kontrasepsi*,
   * ed. 3 (2011), "Pil Kombinasi" — one pack per 28-day cycle.
   */
  PILL: 28,
  /**
   * Cyclofem and similar combined injectables are repeated every 4 weeks.
   * Source: BKKBN & Kemenkes, *Buku Panduan Praktis Pelayanan Kontrasepsi*,
   * ed. 3 (2011), "Suntikan Kombinasi" — "diberikan setiap 4 minggu".
   */
  INJECTABLE_1_MONTH: 28,
  /**
   * DMPA 150 mg is repeated every 12 weeks.
   * Source: BKKBN & Kemenkes, *Buku Panduan Praktis Pelayanan Kontrasepsi*,
   * ed. 3 (2011), "Suntikan Progestin" — DMPA "setiap 12 minggu"; Kemenkes,
   * *Pedoman Pelayanan KB Pasca Persalinan* (2021) repeats the 12-week
   * interval.
   */
  INJECTABLE_3_MONTH: 84,
  /** A barrier method: nothing lapses, so nothing is due. */
  CONDOM: null,
  /** Control date entered by the clinician (see above). */
  IUD: null,
  /** Control date entered by the clinician (see above). */
  IMPLANT: null,
};
