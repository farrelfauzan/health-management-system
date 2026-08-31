import { z } from 'zod';

/**
 * ACCOMMODATION (IMP-15) is the one category priced per ward class rather than
 * per service — the room class *is* the product — which is why a tariff in it
 * must carry `roomClass` and a tariff in any other must not.
 */
export const SERVICE_TARIFF_CATEGORIES = [
  'CONSULTATION',
  'PROCEDURE',
  'ACCOMMODATION',
  'OTHER',
] as const;

export const serviceTariffCategorySchema = z.enum(SERVICE_TARIFF_CATEGORIES);

export type ServiceTariffCategoryValue = z.infer<typeof serviceTariffCategorySchema>;

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;

export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);

export type InvoiceStatusValue = z.infer<typeof invoiceStatusSchema>;

/**
 * Allowed invoice status transitions. A DRAFT can be regenerated freely, so it
 * only ever moves forward to ISSUED or is voided. An ISSUED invoice is a
 * document handed to the patient: correcting it means VOID (with reason and
 * audit) plus a fresh invoice, never editing in place. PAID is terminal for
 * v1 — refunds are out of scope, so a mistaken payment is an operational
 * correction, not a status transition. VOID is terminal by definition.
 */
export const INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatusValue,
  readonly InvoiceStatusValue[]
> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
} as const;

export const INVOICE_ITEM_TYPES = [
  'CONSULTATION',
  'PROCEDURE',
  'MEDICATION',
  'ACCOMMODATION',
  'OTHER',
] as const;

export const invoiceItemTypeSchema = z.enum(INVOICE_ITEM_TYPES);

export type InvoiceItemTypeValue = z.infer<typeof invoiceItemTypeSchema>;

/**
 * How an invoice was settled. INSURANCE covers private payers recorded
 * manually; BPJS claims are not payments and arrive with Phase 11.
 */
export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'QRIS', 'INSURANCE'] as const;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export type PaymentMethodValue = z.infer<typeof paymentMethodSchema>;

export function canTransitionInvoiceStatus(
  fromStatus: InvoiceStatusValue,
  toStatus: InvoiceStatusValue,
): boolean {
  return INVOICE_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

const MAX_TARIFF_CODE_LENGTH = 32;

const MAX_TARIFF_NAME_LENGTH = 255;

const MAX_ICD9CM_CODE_LENGTH = 16;

const MAX_VOID_REASON_LENGTH = 500;

const MAX_REFERENCE_NUMBER_LENGTH = 100;

const MAX_PAYMENT_NOTES_LENGTH = 1000;

const MAX_TARIFF_SEARCH_LENGTH = 100;

const CENTS_PER_RUPIAH_UNIT = 100;

const DECIMAL_PLACE_TOLERANCE = 1e-6;

/** Upper bound of the `Decimal(12, 2)` money columns. */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const scaled = value * CENTS_PER_RUPIAH_UNIT;
  return Math.abs(scaled - Math.round(scaled)) < DECIMAL_PLACE_TOLERANCE;
}

/**
 * A rupiah amount as the API accepts it: non-negative, within the
 * `Decimal(12, 2)` column range, and at most two decimal places so nothing is
 * silently rounded on the way into a financial record.
 */
export const moneyAmountSchema = z
  .number()
  .min(0)
  .max(MAX_MONEY_AMOUNT)
  .refine(hasAtMostTwoDecimalPlaces, { message: 'Amounts use at most two decimal places' });

/**
 * A calendar date with no time component, validated against the real calendar
 * so `2026-02-31` is rejected rather than silently rolling into March.
 */
const billingCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map((part) => Number(part));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, 'Date must be a valid calendar date');

/**
 * `roomClassId` is required for ACCOMMODATION and refused for everything else,
 * mirroring the CHECK constraint in the migration. A field that means
 * something on one row and nothing on the next is how the two start
 * disagreeing, so the API refuses the combination rather than ignoring it.
 *
 * It is a room-class id rather than an enum value because the classes are
 * master data the clinic edits (IMP-11): a "Suite" added this morning is
 * priceable this afternoon.
 */
export const createServiceTariffSchema = z
  .object({
    code: z.string().trim().min(1).max(MAX_TARIFF_CODE_LENGTH),
    name: z.string().trim().min(1).max(MAX_TARIFF_NAME_LENGTH),
    category: serviceTariffCategorySchema,
    icd9cmCode: z.string().trim().min(1).max(MAX_ICD9CM_CODE_LENGTH).optional(),
    roomClassId: z.string().uuid().optional(),
    price: moneyAmountSchema,
    isActive: z.boolean().default(true),
  })
  .refine(
    (payload) => (payload.category === 'ACCOMMODATION') === (payload.roomClassId !== undefined),
    {
      message: 'roomClassId is required for ACCOMMODATION tariffs and not allowed for others',
      path: ['roomClassId'],
    },
  );

/**
 * `code` is immutable — it is the identifier invoice items snapshot their
 * provenance against. `icd9cmCode` is nullable so a mapping can be detached,
 * not just replaced.
 */
export const updateServiceTariffSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TARIFF_NAME_LENGTH).optional(),
    category: serviceTariffCategorySchema.optional(),
    icd9cmCode: z.string().trim().min(1).max(MAX_ICD9CM_CODE_LENGTH).nullable().optional(),
    roomClassId: z.string().uuid().optional(),
    price: moneyAmountSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided',
  });

export const listServiceTariffsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  category: serviceTariffCategorySchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().min(1).max(MAX_TARIFF_SEARCH_LENGTH).optional(),
});

/**
 * `consultationTariffId` is only needed when more than one active CONSULTATION
 * tariff exists — with a single one the server picks it, and with none the
 * consultation line is skipped and reported as a gap.
 */
export const generateInvoiceSchema = z.object({
  encounterId: z.string().uuid(),
  consultationTariffId: z.string().uuid().optional(),
});

/**
 * `amount` must equal the invoice total. Requiring the client to repeat the
 * number is deliberate: it proves the cashier saw the amount they took, and a
 * stale screen showing an outdated total fails loudly instead of settling the
 * wrong bill.
 */
export const recordPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: moneyAmountSchema,
  referenceNumber: z.string().trim().min(1).max(MAX_REFERENCE_NUMBER_LENGTH).optional(),
  notes: z.string().trim().min(1).max(MAX_PAYMENT_NOTES_LENGTH).optional(),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_VOID_REASON_LENGTH),
});

export const listInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: invoiceStatusSchema.optional(),
    patientId: z.string().uuid().optional(),
    encounterId: z.string().uuid().optional(),
    admissionId: z.string().uuid().optional(),
    createdFrom: billingCalendarDateSchema.optional(),
    createdTo: billingCalendarDateSchema.optional(),
  })
  .refine(
    (query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo,
    { message: 'createdFrom must be earlier than or equal to createdTo' },
  );

export const cashierDailyReportQuerySchema = z.object({
  /** Clinic-local calendar day to report on; the clinic's today when omitted. */
  date: billingCalendarDateSchema.optional(),
});

export type CreateServiceTariffInput = z.infer<typeof createServiceTariffSchema>;
export type UpdateServiceTariffInput = z.infer<typeof updateServiceTariffSchema>;
export type ListServiceTariffsQueryInput = z.infer<typeof listServiceTariffsQuerySchema>;
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
export type ListInvoicesQueryInput = z.infer<typeof listInvoicesQuerySchema>;
export type CashierDailyReportQueryInput = z.infer<typeof cashierDailyReportQuerySchema>;

/**
 * What a browser may hand the clinic-logo upload (P16-T02).
 *
 * Three types, not the bucket's list: `docs/security/file-uploads.md` §2
 * requires every surface to declare its own allowlist rather than inherit the
 * storage default. WebP is here because phone cameras and design tools both
 * emit it; SVG deliberately is not — it is a document format with script and
 * external-reference semantics, and the one thing a logo must not be able to
 * do is execute or phone home from inside a rendered invoice.
 */
export const CLINIC_LOGO_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const clinicLogoUploadMimeTypeSchema = z.enum(CLINIC_LOGO_UPLOAD_MIME_TYPES);

export type ClinicLogoUploadMimeTypeValue = z.infer<typeof clinicLogoUploadMimeTypeSchema>;

/**
 * What the server stores, whatever arrived. Every accepted image is decoded
 * and re-encoded to PNG before it is kept: lossless for the flat colour a
 * logo is made of, universally renderable by the PDF engine, and alpha-
 * preserving so a transparent mark does not gain a white box on a coloured
 * invoice header.
 */
export const CLINIC_LOGO_STORED_MIME_TYPE = 'image/png';

/**
 * 2 MiB, well under the bucket's own 5 MiB ceiling. A logo is a few tens of
 * kilobytes; anything approaching this is a photograph someone dropped in by
 * mistake, and refusing it before signing costs the clinic one clear message
 * instead of a slow upload that the re-encode then has to chew through.
 */
export const CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * The longest edge the stored logo keeps. An invoice header renders it at a
 * few centimetres, and the resolved `clinic.logo` variable is embedded in the
 * document as a `data:` URI — so every pixel above what print needs is
 * base64 in the HTML the renderer has to parse, twice, on every invoice.
 */
export const CLINIC_LOGO_MAX_EDGE_PIXELS = 1024;

export const createClinicLogoUploadUrlSchema = z.object({
  mimeType: clinicLogoUploadMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES),
});

const optionalClinicProfileTextSchema = z.string().trim().max(255);

/**
 * Every field is optional because this is a PATCH over a record clinics fill
 * in over time, and `.nullable()` on the optional ones is what lets a value be
 * *cleared* — `undefined` means "leave it alone", `null` means "remove it".
 * `name` is the exception in both directions: it cannot be cleared, and it is
 * required on the first save, which the service enforces because only it knows
 * whether a row exists yet.
 */
export const updateClinicProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    legalName: optionalClinicProfileTextSchema.nullable().optional(),
    address: z.string().trim().max(1000).nullable().optional(),
    phoneNumber: optionalClinicProfileTextSchema.nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    licenseNumber: optionalClinicProfileTextSchema.nullable().optional(),
    taxId: optionalClinicProfileTextSchema.nullable().optional(),
    /**
     * A key this API minted for a logo upload, `null` to remove the current
     * logo, or absent to leave it untouched. The key is proven rather than
     * trusted at the service — a confirm naming another feature's object must
     * not become this clinic's letterhead.
     */
    logoStorageKey: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export type CreateClinicLogoUploadUrlInput = z.infer<typeof createClinicLogoUploadUrlSchema>;
export type UpdateClinicProfileInput = z.infer<typeof updateClinicProfileSchema>;
