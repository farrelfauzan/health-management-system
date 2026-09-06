import { z } from 'zod';

export const PRESCRIPTION_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_DISPENSED',
  'DISPENSED',
  'CANCELLED',
] as const;

export const prescriptionStatusSchema = z.enum(PRESCRIPTION_STATUSES);

export type PrescriptionStatusValue = z.infer<typeof prescriptionStatusSchema>;

export const MEDICATION_UNITS = [
  'TABLET',
  'KAPSUL',
  'KAPLET',
  'SACHET',
  'AMPUL',
  'VIAL',
  'BOTOL',
  'TUBE',
  'STRIP',
  'BOX',
  'PCS',
  'ML',
  'MG',
  'GRAM',
  'MCG',
  'IU',
  'TETES',
  'SUPOSITORIA',
] as const;

export const medicationUnitSchema = z.enum(MEDICATION_UNITS);

export type MedicationUnitValue = z.infer<typeof medicationUnitSchema>;

export const MEDICATION_CATEGORIES = [
  'OBAT_BEBAS',
  'OBAT_BEBAS_TERBATAS',
  'OBAT_KERAS',
  'PSIKOTROPIKA',
  'NARKOTIKA',
  'OBAT_HERBAL',
  'SUPLEMEN',
  'ALAT_KESEHATAN',
] as const;

export const medicationCategorySchema = z.enum(MEDICATION_CATEGORIES);

export type MedicationCategoryValue = z.infer<typeof medicationCategorySchema>;

export const DISPENSE_STATUSES = ['DISPENSED', 'CANCELLED'] as const;

export const dispenseStatusSchema = z.enum(DISPENSE_STATUSES);

export type DispenseStatusValue = z.infer<typeof dispenseStatusSchema>;

export const DISPENSABLE_PRESCRIPTION_STATUSES: readonly PrescriptionStatusValue[] = [
  'ISSUED',
  'PARTIALLY_DISPENSED',
];

export function isPrescriptionDispensable(status: PrescriptionStatusValue): boolean {
  return DISPENSABLE_PRESCRIPTION_STATUSES.includes(status);
}

export function resolvePrescriptionStatusAfterDispense(
  hasRemainingQuantity: boolean,
): PrescriptionStatusValue {
  return hasRemainingQuantity ? 'PARTIALLY_DISPENSED' : 'DISPENSED';
}

/**
 * Product lines must name distinct medications. Compound lines are exempt and
 * always have been in spirit: a prescription may legitimately carry two
 * different puyer, and neither names a product at all (P10-T18).
 */
function hasUniqueMedicationIds(items: Array<{ medicationId?: string }>): boolean {
  const medicationIds = items
    .map((item) => item.medicationId)
    .filter((medicationId): medicationId is string => medicationId !== undefined);
  return new Set(medicationIds).size === medicationIds.length;
}

export const listMedicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).max(100).optional(),
  category: medicationCategorySchema.optional(),
  reorderOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const medicationCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    'Medication code may only contain letters, digits, dot, dash, underscore',
  );

// KFA (Kamus Farmasi dan Alat Kesehatan) product codes are numeric strings
// issued by Kemenkes; SATUSEHAT medication resources are keyed by them.
export const kfaCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,20}$/, 'KFA code must be 4-20 digits');

export const medicationNameSchema = z.string().trim().min(2).max(200);
export const medicationFormSchema = z.string().trim().min(1).max(100);
export const medicationStrengthSchema = z.string().trim().min(1).max(100);
export const medicationReorderLevelSchema = z.number().int().min(0).max(1000000);

export const createMedicationSchema = z.object({
  code: medicationCodeSchema,
  kfaCode: kfaCodeSchema.optional(),
  name: medicationNameSchema,
  form: medicationFormSchema.optional(),
  strength: medicationStrengthSchema.optional(),
  unit: medicationUnitSchema.optional(),
  category: medicationCategorySchema.optional(),
  reorderLevel: medicationReorderLevelSchema.optional().default(0),
  /** P10-T16. Whether this row is a vaccine, which is what filters the immunisation picker. */
  isVaccine: z.boolean().optional(),
}).strict();

export const updateMedicationSchema = z
  .object({
    code: medicationCodeSchema.optional(),
    kfaCode: kfaCodeSchema.nullable().optional(),
    name: medicationNameSchema.optional(),
    form: medicationFormSchema.nullable().optional(),
    strength: medicationStrengthSchema.nullable().optional(),
    unit: medicationUnitSchema.nullable().optional(),
    category: medicationCategorySchema.nullable().optional(),
    reorderLevel: medicationReorderLevelSchema.optional(),
    isVaccine: z.boolean().optional(),
  })
  .strict()
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export const listPrescriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: prescriptionStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  encounterId: z.string().uuid().optional(),
});

export const compoundPreparationSchema = z.enum([
  'PUYER',
  'KAPSUL',
  'SIRUP',
  'SALEP',
  'OTHER',
]);

export const prescriptionItemComponentSchema = z.object({
  medicationId: z.string().uuid(),
  /**
   * Decimal, because a puyer routinely uses a third or a half of a tablet —
   * which is the whole reason the compound exists. Four places, matching the
   * column.
   */
  quantity: z.number().positive().max(10000),
  unit: z.string().trim().min(1).max(32),
});

/**
 * One prescription line: a catalog product, or a compound (racikan).
 *
 * The two shapes are refused if mixed. A line carrying both a product and a
 * compound name would leave every reader downstream deciding which one it
 * meant, and the database CHECK would reject it anyway — better to say so
 * where the doctor can still fix it.
 */
export const prescriptionItemSchema = z
  .object({
    medicationId: z.string().uuid().optional(),
    dosage: z.string().trim().min(1).max(100),
    frequency: z.string().trim().min(1).max(100),
    durationDays: z.number().int().min(1).max(365).optional(),
    quantity: z.number().int().min(1).max(10000),
    instructions: z.string().trim().min(1).max(500).optional(),
    isCompound: z.boolean().optional(),
    compoundName: z.string().trim().min(1).max(200).optional(),
    preparation: compoundPreparationSchema.optional(),
    dosageUnit: z.string().trim().min(1).max(32).optional(),
    components: z.array(prescriptionItemComponentSchema).min(1).max(20).optional(),
  })
  .superRefine((item, context) => {
    if (item.isCompound) {
      if (item.medicationId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['medicationId'],
          message: 'A compound line names its ingredients, not a catalog product',
        });
      }
      if (!item.compoundName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['compoundName'],
          message: 'A compound needs a name for its label',
        });
      }
      if (!item.components || item.components.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components'],
          message: 'A compound needs at least one ingredient',
        });
      }
      const componentIds = (item.components ?? []).map((component) => component.medicationId);
      if (new Set(componentIds).size !== componentIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components'],
          // Two rows for one product would allocate its stock twice.
          message: 'A compound cannot list the same ingredient twice',
        });
      }
      return;
    }
    if (!item.medicationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['medicationId'],
        message: 'A prescription line names a medication, or is a compound',
      });
    }
    if (item.components && item.components.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components'],
        message: 'Only a compound line has ingredients',
      });
    }
  });

export const createPrescriptionSchema = z
  .object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid().optional(),
    /**
     * The visit this prescription was written during. Optional because a
     * repeat prescription can be issued between visits, and because MVP rows
     * predate the encounter record entirely.
     */
    encounterId: z.string().uuid().optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    items: z.array(prescriptionItemSchema).min(1).max(50),
  })
  .refine((payload) => hasUniqueMedicationIds(payload.items), {
    message: 'Prescription items must reference unique medications',
    path: ['items'],
  });

/**
 * One line handed over: a catalog product, or a whole compound named by its
 * prescription line. Quantity for a compound is how many whole compounds —
 * partial dispense means fewer of them, never a partial ingredient.
 */
export const dispenseItemInputSchema = z
  .object({
    medicationId: z.string().uuid().optional(),
    prescriptionItemId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(10000),
  })
  .refine(
    (item) => Boolean(item.medicationId) !== Boolean(item.prescriptionItemId),
    {
      path: ['medicationId'],
      message: 'Name either a medication or a compound prescription line, not both',
    },
  );

export const createDispenseSchema = z
  .object({
    prescriptionId: z.string().uuid(),
    notes: z.string().trim().min(1).max(1000).optional(),
    items: z.array(dispenseItemInputSchema).min(1).max(50),
  })
  .refine((payload) => hasUniqueMedicationIds(payload.items), {
    message: 'Dispense items must reference unique medications',
    path: ['items'],
  })
  .refine((payload) => hasUniqueCompoundLines(payload.items), {
    message: 'Dispense items must reference unique compound lines',
    path: ['items'],
  });

function hasUniqueCompoundLines(items: Array<{ prescriptionItemId?: string }>): boolean {
  const itemIds = items
    .map((item) => item.prescriptionItemId)
    .filter((itemId): itemId is string => itemId !== undefined);
  return new Set(itemIds).size === itemIds.length;
}

const inventoryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .refine(
    (value) => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    'Date is invalid',
  );

export const createStockReceiptSchema = z.object({
  medicationId: z.string().uuid(),
  batchNumber: z.string().trim().min(1).max(100),
  expiryDate: inventoryDateSchema,
  quantity: z.number().int().min(1).max(1000000),
  receivedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
});

export const listStockReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  medicationId: z.string().uuid().optional(),
});

export const expiryReportQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(3650).default(90),
});

export type ListMedicationsQueryInput = z.infer<typeof listMedicationsQuerySchema>;
export type CompoundPreparationValue = z.infer<typeof compoundPreparationSchema>;
export type PrescriptionItemComponentInput = z.infer<typeof prescriptionItemComponentSchema>;

export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;
export type UpdateMedicationInput = z.infer<typeof updateMedicationSchema>;
export type ListPrescriptionsQueryInput = z.infer<typeof listPrescriptionsQuerySchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type DispenseItemInput = z.infer<typeof dispenseItemInputSchema>;
export type CreateDispenseInput = z.infer<typeof createDispenseSchema>;
export type CreateStockReceiptInput = z.infer<typeof createStockReceiptSchema>;
export type ListStockReceiptsQueryInput = z.infer<typeof listStockReceiptsQuerySchema>;
export type ExpiryReportQueryInput = z.infer<typeof expiryReportQuerySchema>;
