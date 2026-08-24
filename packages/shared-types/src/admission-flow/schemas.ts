import { z } from 'zod';

/**
 * CANCELLED when the admission was opened in error. Like `EncounterStatus`, a
 * settled admission is never re-opened — a correction is a new admission, so
 * the original stays auditable.
 */
export const ADMISSION_STATUSES = ['ADMITTED', 'DISCHARGED', 'CANCELLED'] as const;

export const admissionStatusSchema = z.enum(ADMISSION_STATUSES);

export type AdmissionStatusValue = z.infer<typeof admissionStatusSchema>;

/**
 * Allowed admission transitions. ADMITTED is the only live state; DISCHARGED
 * and CANCELLED are both terminal, which is the whole reason a readmission is
 * a new row rather than a status flip.
 */
export const ADMISSION_STATUS_TRANSITIONS: Record<
  AdmissionStatusValue,
  readonly AdmissionStatusValue[]
> = {
  ADMITTED: ['DISCHARGED', 'CANCELLED'],
  DISCHARGED: [],
  CANCELLED: [],
} as const;

export function canTransitionAdmissionStatus(
  fromStatus: AdmissionStatusValue,
  toStatus: AdmissionStatusValue,
): boolean {
  return ADMISSION_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

const MAX_REASON_LENGTH = 1000;

const MAX_SUMMARY_LENGTH = 5000;

const MAX_SEARCH_LENGTH = 100;

const DEFAULT_PAGE_SIZE = 10;

const MAX_PAGE_SIZE = 100;

/**
 * A clerk entering last night's admission this morning is routine, so a
 * caller-supplied timestamp is accepted — but only backwards. A future
 * admission is a booking, which is what `Appointment` is for.
 */
const pastInstantSchema = z
  .string()
  .datetime()
  .refine((value) => new Date(value).getTime() <= Date.now(), {
    message: 'Timestamp may not be in the future',
  });

export const admitPatientSchema = z.object({
  patientId: z.string().uuid(),
  admittingDoctorId: z.string().uuid(),
  bedId: z.string().uuid(),
  /**
   * The outpatient consultation that referred the patient in, when there was
   * one. Optional: a direct admission has no source encounter.
   */
  sourceEncounterId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).optional(),
  admittedAt: pastInstantSchema.optional(),
});

export const transferAdmissionSchema = z.object({
  bedId: z.string().uuid(),
  effectiveAt: pastInstantSchema.optional(),
});

export const dischargeAdmissionSchema = z.object({
  dischargedAt: pastInstantSchema.optional(),
  dischargeSummary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH).optional(),
});

export const cancelAdmissionSchema = z.object({
  // Required, unlike a discharge summary. A cancellation erases a stay from
  // the ward census, and the only account of why it happened is this field.
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
});

export const updateAdmissionSchema = z
  .object({
    reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).optional(),
    admittingDoctorId: z.string().uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAdmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  status: admissionStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  admittingDoctorId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
});

export type AdmitPatientInput = z.infer<typeof admitPatientSchema>;
export type TransferAdmissionInput = z.infer<typeof transferAdmissionSchema>;
export type DischargeAdmissionInput = z.infer<typeof dischargeAdmissionSchema>;
export type CancelAdmissionInput = z.infer<typeof cancelAdmissionSchema>;
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>;
export type ListAdmissionsQueryInput = z.infer<typeof listAdmissionsQuerySchema>;
