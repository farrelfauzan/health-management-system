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
