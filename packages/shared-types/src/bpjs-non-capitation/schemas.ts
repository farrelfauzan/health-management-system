import { z } from 'zod';

/** A calendar month, `YYYY-MM`, read in the clinic's timezone (P25-T16). */
export const nonCapitationMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/** A `YYYY-MM-DD` calendar date. */
const nonCapitationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * The payable units of the BPJS non-capitation recap, shaped like the eClaim
 * entry (P25-T16; `docs/ops/bpjs-bidan-jejaring-claims-spike.md` §6). Tariffs
 * are Permenkes 3/2023 Pasal 19–22, pp. 13–16, batang tubuh.
 */
export const NON_CAPITATION_SERVICE_TYPES = [
  'ANTENATAL_MIDWIFE',
  'ANTENATAL_DOCTOR',
  'ANTENATAL_DOCTOR_ULTRASOUND',
  'PRE_REFERRAL',
  'DELIVERY_WITH_DOCTOR',
  'DELIVERY_HEALTH_WORKER_TEAM',
  'POSTNATAL_MOTHER_NEWBORN',
  'POSTNATAL_MOTHER',
  'FAMILY_PLANNING_IUD',
  'FAMILY_PLANNING_IMPLANT',
  'FAMILY_PLANNING_INJECTION',
] as const;

export const nonCapitationServiceTypeSchema = z.enum(NON_CAPITATION_SERVICE_TYPES);

export type NonCapitationServiceTypeValue = z.infer<typeof nonCapitationServiceTypeSchema>;

/**
 * Where one recap line stands. `SENT` once marked; otherwise `OPEN`, then
 * `DUE_SOON` in the days before the induk's filing date, `LATE` after it, and
 * `EXPIRED` six months after the service, when the claim can no longer be
 * filed (Perpres 82/2018 Pasal 77).
 */
export const NON_CAPITATION_CLAIM_STATUSES = [
  'OPEN',
  'DUE_SOON',
  'LATE',
  'EXPIRED',
  'SENT',
] as const;

export const nonCapitationClaimStatusSchema = z.enum(NON_CAPITATION_CLAIM_STATUSES);

export type NonCapitationClaimStatusValue = z.infer<typeof nonCapitationClaimStatusSchema>;

/** The JSON preview by default, or the CSV recap and the PDF letter for the induk. */
export const nonCapitationRecapFormatSchema = z.enum(['json', 'csv', 'pdf']);

export type NonCapitationRecapFormatValue = z.infer<typeof nonCapitationRecapFormatSchema>;

export const nonCapitationRecapQuerySchema = z.object({
  month: nonCapitationMonthSchema,
  format: nonCapitationRecapFormatSchema.optional(),
});

export type NonCapitationRecapQueryInput = z.infer<typeof nonCapitationRecapQuerySchema>;

/** The most lines one mark request may carry; a month of a PMB is far below it. */
export const NON_CAPITATION_MARK_MAX_ITEMS = 500;

/**
 * Marks recap lines of one month as handed to the induk. The month is part
 * of the request because a line is checked against that month's recap: a
 * source that is not a line of it is answered `NOT_IN_RECAP`, never marked.
 */
export const markNonCapitationLinesSchema = z.object({
  month: nonCapitationMonthSchema,
  items: z
    .array(
      z.object({
        serviceType: nonCapitationServiceTypeSchema,
        sourceId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(NON_CAPITATION_MARK_MAX_ITEMS),
});

export type MarkNonCapitationLinesInput = z.infer<typeof markNonCapitationLinesSchema>;

/** Permenkes 28/2014 lampiran p. 31 point 8: "paling lambat tanggal 10 bulan berikutnya". */
export const NON_CAPITATION_DEFAULT_FILING_DAY = 10;

/** The latest filing day that exists in every month. */
export const NON_CAPITATION_MAX_FILING_DAY = 28;

/**
 * The induk FKTP settings (P25-T16, D-043). Everything Q12 will answer is here
 * rather than in code: which induk, whether it is government-owned, whether
 * the PMB keys eClaim itself, and the filing day in the induk's PKS. `null`
 * means "not known yet".
 */
export const updateNonCapitationSettingsSchema = z.object({
  networkParentProviderCode: z.string().trim().min(1).max(20).nullable(),
  networkParentProviderName: z.string().trim().min(1).max(200).nullable(),
  isNetworkParentGovernmentOwned: z.boolean().nullable(),
  hasOwnEclaimLogin: z.boolean().nullable(),
  filingDayOfMonth: z.number().int().min(1).max(NON_CAPITATION_MAX_FILING_DAY),
});

export type UpdateNonCapitationSettingsInput = z.infer<typeof updateNonCapitationSettingsSchema>;

/** Rupiah; the largest tariff Permenkes 3/2023 sets for an FKTP is far below it. */
export const NON_CAPITATION_MAX_TARIFF_AMOUNT = 100_000_000;

/**
 * A new tariff row from `validFrom`. The open row of the same service type is
 * closed the day before, so a new regulation is a new row and the old figure
 * keeps pricing the services given under it.
 */
export const createNonCapitationTariffSchema = z.object({
  serviceType: nonCapitationServiceTypeSchema,
  amount: z.number().positive().max(NON_CAPITATION_MAX_TARIFF_AMOUNT),
  validFrom: nonCapitationDateSchema,
  regulationReference: z.string().trim().min(1).max(500),
});

export type CreateNonCapitationTariffInput = z.infer<typeof createNonCapitationTariffSchema>;

/** A tariff row already starts on or after this date for the service type (409). */
export const NON_CAPITATION_TARIFF_OVERLAP_ERROR_CODE = 'NON_CAPITATION_TARIFF_OVERLAP';

/**
 * A non-government induk "dapat mengenakan biaya pembinaan dengan besaran
 * maksimal 10% dari total klaim" (Permenkes 28/2014 lampiran p. 39). A ceiling
 * set by the regulation, not a rate: the actual share is the PKS's.
 */
export const NON_CAPITATION_MAX_COACHING_FEE_PERCENT = 10;

/** A line turns `DUE_SOON` this many days before the filing date. */
export const NON_CAPITATION_DUE_SOON_DAYS = 5;

/** "Paling lambat 6 (enam) bulan sejak pelayanan kesehatan selesai diberikan" (Perpres 82/2018 Pasal 77). */
export const NON_CAPITATION_EXPIRY_MONTHS = 6;

/** Obstetric ultrasound, "diagnostic ultrasound of gravid uterus" (ICD-9-CM 88.78). */
export const NON_CAPITATION_OBSTETRIC_ULTRASOUND_PROCEDURE_CODE = '88.78';
