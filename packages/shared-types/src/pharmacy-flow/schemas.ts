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

function hasUniqueMedicationIds(items: Array<{ medicationId: string }>): boolean {
  const medicationIds = items.map((item) => item.medicationId);
  return new Set(medicationIds).size === medicationIds.length;
}

export const listMedicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).max(100).optional(),
});

export const prescriptionItemSchema = z.object({
  medicationId: z.string().uuid(),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  durationDays: z.number().int().min(1).max(365).optional(),
  quantity: z.number().int().min(1).max(10000),
  instructions: z.string().trim().min(1).max(500).optional(),
});

export const createPrescriptionSchema = z
  .object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid().optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
    items: z.array(prescriptionItemSchema).min(1).max(50),
  })
  .refine((payload) => hasUniqueMedicationIds(payload.items), {
    message: 'Prescription items must reference unique medications',
    path: ['items'],
  });

export const dispenseItemInputSchema = z.object({
  medicationId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10000),
});

export const createDispenseSchema = z
  .object({
    prescriptionId: z.string().uuid(),
    notes: z.string().trim().min(1).max(1000).optional(),
    items: z.array(dispenseItemInputSchema).min(1).max(50),
  })
  .refine((payload) => hasUniqueMedicationIds(payload.items), {
    message: 'Dispense items must reference unique medications',
    path: ['items'],
  });

export type ListMedicationsQueryInput = z.infer<typeof listMedicationsQuerySchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type DispenseItemInput = z.infer<typeof dispenseItemInputSchema>;
export type CreateDispenseInput = z.infer<typeof createDispenseSchema>;
