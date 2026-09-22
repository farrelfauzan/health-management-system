import { z } from 'zod';

/**
 * Who the clinic is as a taxpayer (P27-T02, D-038 in `docs/post-mvp/decisions.md`).
 * The legal form decides which income-tax regime it may use under PP 55/2022 as
 * amended by PP 20/2026, so it is recorded rather than inferred from the name.
 */
export const taxpayerTypeSchema = z.enum([
  'INDIVIDUAL',
  'PT_PERORANGAN',
  'PT',
  'CV',
  'KOPERASI',
  'YAYASAN',
]);

/** `PP55_FINAL` is the 0.5% final tax on gross turnover; `GENERAL` is Pasal 17 / 31E. */
export const incomeTaxRegimeSchema = z.enum(['PP55_FINAL', 'GENERAL']);

/** Every taxpayer type and regime, in the order a form lists them. */
export const TAXPAYER_TYPES = taxpayerTypeSchema.options;
export const INCOME_TAX_REGIMES = incomeTaxRegimeSchema.options;

/**
 * What a stored NPWP looks like to Coretax: missing, the 15-digit format retired
 * with Coretax (kept and flagged, never rejected on an unrelated save), 16 digits,
 * or something that is neither.
 */
export const npwpStatusSchema = z.enum(['MISSING', 'LEGACY_15_DIGIT', 'VALID', 'INVALID']);

export const NPWP_DIGIT_COUNT = 16;
export const LEGACY_NPWP_DIGIT_COUNT = 15;
/** NITKU = the 16-digit NPWP plus a six-digit place-of-business suffix (PMK 136/2023). */
export const NITKU_DIGIT_COUNT = 22;
/** PP 23/2018 opened the final-tax scheme; no clinic can have started before it. */
export const PP55_EARLIEST_START_YEAR = 2018;
/**
 * PP 20/2026 (in force 22 April 2026) closed the scheme to a PT or CV that had
 * not started using it; one already on it finishes its original period.
 */
export const PP55_BADAN_TRANSITION_LAST_START_YEAR = 2026;

export const CLINIC_NPWP_INVALID_ERROR_CODE = 'CLINIC_NPWP_INVALID';
export const TAX_PP55_NOT_ELIGIBLE_ERROR_CODE = 'TAX_PP55_NOT_ELIGIBLE';
export const TAX_PKP_SINCE_REQUIRED_ERROR_CODE = 'TAX_PKP_SINCE_REQUIRED';
export const TAX_NITKU_NPWP_MISMATCH_ERROR_CODE = 'TAX_NITKU_NPWP_MISMATCH';

/** Digits only, after the separators people type (`01.234.567.8-901.000`). */
const nitkuSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .refine((value) => new RegExp(`^\\d{${NITKU_DIGIT_COUNT}}$`).test(value), {
    message: `NITKU must be ${NITKU_DIGIT_COUNT} digits`,
  });

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'Not a calendar date',
  });

/**
 * A PATCH over the clinic's tax profile. `undefined` leaves a field alone and
 * `null` clears it. Rules that need the stored row as well as the request — PP 55
 * eligibility, the PKP date, the NITKU prefix — are the service's, because only
 * the merged state can be judged.
 */
export const updateTaxSettingsSchema = z
  .object({
    taxpayerType: taxpayerTypeSchema.nullable().optional(),
    incomeTaxRegime: incomeTaxRegimeSchema.optional(),
    pp55StartYear: z.number().int().min(PP55_EARLIEST_START_YEAR).max(2100).nullable().optional(),
    isPkp: z.boolean().optional(),
    pkpSince: calendarDateSchema.nullable().optional(),
    nitku: nitkuSchema.nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export type TaxpayerTypeValue = z.infer<typeof taxpayerTypeSchema>;
export type IncomeTaxRegimeValue = z.infer<typeof incomeTaxRegimeSchema>;
export type NpwpStatusValue = z.infer<typeof npwpStatusSchema>;
export type UpdateTaxSettingsInput = z.infer<typeof updateTaxSettingsSchema>;

/**
 * How PPN treats what a tax code covers (P27-T03). `EXEMPT_MEDICAL` is the
 * PP 49/2022 Pasal 11 exemption for medical services, reported on faktur code
 * 08; `STANDARD` is taxed (medicines, aesthetic and other non-medical services)
 * at a rate the code carries; `EXEMPT_OTHER` is another facility such as a
 * programme vaccine, also code 08; `NOT_OBJECT` is outside PPN altogether.
 */
export const ppnTreatmentSchema = z.enum([
  'EXEMPT_MEDICAL',
  'STANDARD',
  'EXEMPT_OTHER',
  'NOT_OBJECT',
]);
export const PPN_TREATMENTS = ppnTreatmentSchema.options;

/** Coretax faktur transaction codes a clinic uses: 01 ordinary, 04 DPP nilai lain, 08 exempt. */
export const fakturTransactionCodeSchema = z.enum(['01', '04', '08']);
export const FAKTUR_TRANSACTION_CODES = fakturTransactionCodeSchema.options;

/**
 * What a category default is keyed by: each service-tariff category, and one
 * row for every medication.
 */
export const taxDefaultTargetSchema = z.enum([
  'CONSULTATION',
  'PROCEDURE',
  'ACCOMMODATION',
  'LAB',
  'OTHER',
  'MEDICATION',
]);
export const TAX_DEFAULT_TARGETS = taxDefaultTargetSchema.options;

/** What an assignment row is: a tariff or a medication. */
export const taxAssignmentKindSchema = z.enum(['SERVICE_TARIFF', 'MEDICATION']);

/** Where an item's effective tax code came from. */
export const taxCodeSourceSchema = z.enum(['OVERRIDE', 'CATEGORY_DEFAULT', 'UNRESOLVED']);

export const TAX_CODE_SYSTEM_LOCKED_ERROR_CODE = 'TAX_CODE_SYSTEM_LOCKED';
export const TAX_CODE_IN_USE_ERROR_CODE = 'TAX_CODE_IN_USE';
export const TAX_CODE_CONFLICT_ERROR_CODE = 'TAX_CODE_CONFLICT';
export const TAX_CODE_INACTIVE_ERROR_CODE = 'TAX_CODE_INACTIVE';
export const TAX_CODE_FAKTUR_MISMATCH_ERROR_CODE = 'TAX_CODE_FAKTUR_MISMATCH';
export const TAX_RATE_NOT_AFTER_LATEST_ERROR_CODE = 'TAX_RATE_NOT_AFTER_LATEST';
export const TAX_RATE_NOT_APPLICABLE_ERROR_CODE = 'TAX_RATE_NOT_APPLICABLE';
export const TAX_ASSIGNMENT_TARGET_NOT_FOUND_ERROR_CODE = 'TAX_ASSIGNMENT_TARGET_NOT_FOUND';
/** P27-T04: an invoice line with no tax code, or a taxed code with no rate yet. */
export const TAX_CODE_UNRESOLVED_ERROR_CODE = 'TAX_CODE_UNRESOLVED';

export const MAX_TAX_ASSIGNMENT_BATCH_SIZE = 500;

/**
 * The faktur code each treatment reports under. Kept as data so the Zod
 * refinement, the service and the CHECK in the migration say the same thing.
 */
export const ALLOWED_FAKTUR_CODES_BY_TREATMENT: Readonly<
  Record<
    z.infer<typeof ppnTreatmentSchema>,
    readonly (z.infer<typeof fakturTransactionCodeSchema> | null)[]
  >
> = {
  EXEMPT_MEDICAL: ['08'],
  STANDARD: ['01', '04'],
  EXEMPT_OTHER: ['08'],
  NOT_OBJECT: [null],
};

const taxCodeCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'Use 2–40 letters, digits or dashes');

/**
 * One rate: `ratePercent × dppNumerator / dppDenominator` is the effective rate
 * (12 × 11/12 = 11% since PMK 131/2024). Effective from a calendar day; a new
 * regulation is a new row, never an edit (D-038).
 */
export const createTaxCodeRateSchema = z
  .object({
    ratePercent: z.number().min(0).max(100).multipleOf(0.01),
    dppNumerator: z.number().int().min(1).max(1000),
    dppDenominator: z.number().int().min(1).max(1000),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  })
  .refine((input) => input.dppNumerator <= input.dppDenominator, {
    message: 'The DPP fraction cannot exceed 1',
    path: ['dppNumerator'],
  });

function isFakturCodeAllowed(input: {
  ppnTreatment?: z.infer<typeof ppnTreatmentSchema>;
  fakturTransactionCode?: z.infer<typeof fakturTransactionCodeSchema> | null;
}): boolean {
  if (input.ppnTreatment === undefined || input.fakturTransactionCode === undefined) {
    return true;
  }
  return ALLOWED_FAKTUR_CODES_BY_TREATMENT[input.ppnTreatment].includes(
    input.fakturTransactionCode,
  );
}

const FAKTUR_CODE_MESSAGE =
  'Faktur code does not match the treatment: 08 for exempt, 01 or 04 for standard, none for not an object';

/**
 * A clinic-defined tax code. A `STANDARD` code must arrive with its first rate:
 * a taxed code without one would resolve to nothing on the next invoice.
 */
export const createTaxCodeSchema = z
  .object({
    code: taxCodeCodeSchema,
    name: z.string().trim().min(1).max(120),
    ppnTreatment: ppnTreatmentSchema,
    fakturTransactionCode: fakturTransactionCodeSchema.nullable(),
    invoiceNote: z.string().trim().max(200).nullable().optional(),
    initialRate: createTaxCodeRateSchema.optional(),
  })
  .refine(isFakturCodeAllowed, { message: FAKTUR_CODE_MESSAGE, path: ['fakturTransactionCode'] })
  .refine((input) => (input.ppnTreatment === 'STANDARD') === (input.initialRate !== undefined), {
    message: 'A standard code needs its first rate, and only a standard code has one',
    path: ['initialRate'],
  });

/**
 * The treatment is fixed at creation: switching a code between exempt and
 * taxed would silently re-tax every item that uses it, so a different
 * treatment is a different code. The faktur code may move between 01 and 04 on
 * a clinic's own standard code, judged by the service against the stored
 * treatment. On a system code only the name, note and active flag change.
 */
export const updateTaxCodeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    fakturTransactionCode: fakturTransactionCodeSchema.nullable().optional(),
    invoiceNote: z.string().trim().max(200).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

/** Sets one or more category defaults; a target left out keeps its default. */
export const updateTaxCategoryDefaultsSchema = z.object({
  defaults: z
    .array(z.object({ target: taxDefaultTargetSchema, taxCodeId: z.string().uuid().nullable() }))
    .min(1)
    .max(TAX_DEFAULT_TARGETS.length)
    .refine((items) => new Set(items.map((item) => item.target)).size === items.length, {
      message: 'Each target may appear once',
    }),
});

/**
 * Assigns one tax code to many tariffs and medications at once, or clears the
 * override (`taxCodeId: null`) so they fall back to their category default.
 */
export const bulkAssignTaxCodeSchema = z.object({
  targets: z
    .array(z.object({ kind: taxAssignmentKindSchema, id: z.string().uuid() }))
    .min(1)
    .max(MAX_TAX_ASSIGNMENT_BATCH_SIZE),
  taxCodeId: z.string().uuid().nullable(),
});

export const listTaxAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: taxAssignmentKindSchema.optional(),
  source: taxCodeSourceSchema.optional(),
  taxCodeId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

/** Most rows a tariff or medicine list page shows at once. */
export const MAX_TAX_PRICE_BREAKDOWN_IDS = 100;

/**
 * The before/after-PPN breakdown of the tariffs or medicines on one list page
 * (P27-T04), for administrators. `ids` is a comma-separated list, so a page of
 * rows is one GET.
 */
export const listTaxPriceBreakdownsQuerySchema = z.object({
  kind: taxAssignmentKindSchema,
  ids: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().uuid()).min(1).max(MAX_TAX_PRICE_BREAKDOWN_IDS)),
});

/**
 * What a breakdown row can say: taxed with figures, exempt, not taxed because
 * the clinic is not PKP, no code or rate yet, or no price to break down.
 */
export const taxPriceBreakdownStatusSchema = z.enum([
  'TAXED',
  'EXEMPT',
  'NOT_PKP',
  'UNRESOLVED',
  'UNPRICED',
]);

export type PpnTreatmentValue = z.infer<typeof ppnTreatmentSchema>;
export type ListTaxPriceBreakdownsQuery = z.infer<typeof listTaxPriceBreakdownsQuerySchema>;
export type TaxPriceBreakdownStatusValue = z.infer<typeof taxPriceBreakdownStatusSchema>;
export type FakturTransactionCodeValue = z.infer<typeof fakturTransactionCodeSchema>;
export type TaxDefaultTargetValue = z.infer<typeof taxDefaultTargetSchema>;
export type TaxAssignmentKindValue = z.infer<typeof taxAssignmentKindSchema>;
export type TaxCodeSourceValue = z.infer<typeof taxCodeSourceSchema>;
export type CreateTaxCodeRateInput = z.infer<typeof createTaxCodeRateSchema>;
export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;
export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;
export type UpdateTaxCategoryDefaultsInput = z.infer<typeof updateTaxCategoryDefaultsSchema>;
export type BulkAssignTaxCodeInput = z.infer<typeof bulkAssignTaxCodeSchema>;
export type ListTaxAssignmentsQuery = z.infer<typeof listTaxAssignmentsQuerySchema>;

/**
 * The monthly drafts P27-T05 prepares, plus the PPh 21 bukan pegawai draft
 * (BP21 per clinician) P27-T07 adds on the jasa medis ledger.
 */
export const taxReportKindSchema = z.enum(['PP55_OMZET', 'PPN_OUTPUT', 'PPH21_NON_EMPLOYEE']);
export const TAX_REPORT_KINDS = taxReportKindSchema.options;

/** A draft is recomputed at will; a finalized report is a frozen snapshot. */
export const taxReportStatusSchema = z.enum(['DRAFT', 'FINALIZED']);

/** A calendar month, `YYYY-MM`, in the clinic's timezone. */
export const taxReportPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const createTaxReportSchema = z.object({
  period: taxReportPeriodSchema,
  kind: taxReportKindSchema,
});

export const listTaxReportsQuerySchema = z.object({
  year: z.coerce.number().int().min(2018).max(2100),
});

/** PP 55/2022 Pasal 56: 0.5% of gross turnover. */
export const PP55_RATE_PERCENT = 0.5;
/** PP 55/2022 Pasal 60(2): an individual's first Rp500 juta a year is not taxed. */
export const PP55_INDIVIDUAL_NON_TAXABLE_OMZET = 500_000_000;
/** The billing code for PPh final UMKM: KAP 411128, KJS 420. */
export const PP55_TAX_ACCOUNT_CODE = '411128';
export const PP55_DEPOSIT_TYPE_CODE = '420';

/**
 * PPh 21 bukan pegawai (P27-T07, PMK 168/2023 Pasal 5(1)(e)): the taxable
 * base is 50% of the gross fee, taxed at the Pasal 17(1)(a) brackets, per
 * period and non-cumulative. The brackets themselves are an effective-dated
 * table, never constants (D-038): a new law is a new set of rows.
 */
export const PPH21_NON_EMPLOYEE_DPP_PERCENT = 50;
/** The billing code for PPh 21 masa: KAP 411121, KJS 100. */
export const PPH21_TAX_ACCOUNT_CODE = '411121';
export const PPH21_DEPOSIT_TYPE_CODE = '100';
/** The tax identity a BP21 names: the clinician's NPWP, else the NIK (which serves as NPWP). */
export const clinicianTaxIdentityKindSchema = z.enum(['NPWP', 'NIK']);
/** Whether a clinician's line can be issued as a BP21. */
export const clinicianTaxIdentityStatusSchema = z.enum(['NPWP', 'NIK', 'MISSING']);
/** The Indonesian wording the draft shows on a line with no NPWP and no NIK. */
export const CLINICIAN_TAX_IDENTITY_INCOMPLETE_LABEL = 'identitas pajak belum lengkap';

export const TAX_REPORT_NOT_APPLICABLE_ERROR_CODE = 'TAX_REPORT_NOT_APPLICABLE';
/** P27-T07: a PPh 21 draft with a clinician who has neither NPWP nor NIK cannot be finalized. */
export const TAX_REPORT_IDENTITY_INCOMPLETE_ERROR_CODE = 'TAX_REPORT_IDENTITY_INCOMPLETE';
/** P27-T07: no PPh 21 bracket set is in force for the period (the table is unseeded). */
export const TAX_BRACKETS_UNAVAILABLE_ERROR_CODE = 'TAX_BRACKETS_UNAVAILABLE';
export const TAX_REPORT_EXISTS_ERROR_CODE = 'TAX_REPORT_EXISTS';
export const TAX_REPORT_FINALIZED_ERROR_CODE = 'TAX_REPORT_FINALIZED';
export const TAX_REPORT_PERIOD_OPEN_ERROR_CODE = 'TAX_REPORT_PERIOD_OPEN';
export const TAX_REPORT_PERIOD_IN_FUTURE_ERROR_CODE = 'TAX_REPORT_PERIOD_IN_FUTURE';
/** P27-T12: only a finalized report has a stored PDF to hand out a link to. */
export const TAX_REPORT_NOT_FINALIZED_ERROR_CODE = 'TAX_REPORT_NOT_FINALIZED';
/** P27-T12: the PDF renderer or the bucket failed; the request can be retried. */
export const TAX_REPORT_PDF_UNAVAILABLE_ERROR_CODE = 'TAX_REPORT_PDF_UNAVAILABLE';

/**
 * A finalized report's stored PDF (P27-T12). READY is served as is, forever;
 * FAILED is rendered again on the next request.
 */
export const taxReportDocumentStatusSchema = z.enum(['READY', 'FAILED']);

export type TaxReportKindValue = z.infer<typeof taxReportKindSchema>;
export type ClinicianTaxIdentityKindValue = z.infer<typeof clinicianTaxIdentityKindSchema>;
export type ClinicianTaxIdentityStatusValue = z.infer<typeof clinicianTaxIdentityStatusSchema>;
export type TaxReportStatusValue = z.infer<typeof taxReportStatusSchema>;
export type TaxReportDocumentStatusValue = z.infer<typeof taxReportDocumentStatusSchema>;
export type CreateTaxReportInput = z.infer<typeof createTaxReportSchema>;
export type ListTaxReportsQuery = z.infer<typeof listTaxReportsQuerySchema>;
