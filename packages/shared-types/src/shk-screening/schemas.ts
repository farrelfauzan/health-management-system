import { z } from 'zod';

/**
 * What the referral laboratory answered for one SHK sample (P25-T10).
 *
 * `RECALL` is a raised TSH: the baby is called back for a confirmatory sample.
 * `INVALID_SAMPLE` is a sample the laboratory could not read — too little
 * blood, a smudged card, or taken too early — and is repeated the same way.
 */
export const shkResultSchema = z.enum(['NORMAL', 'RECALL', 'INVALID_SAMPLE']);

export type ShkResultValue = z.infer<typeof shkResultSchema>;

/**
 * Why a sample was closed without a heel prick (P25-T18). `RECORDED_BEFORE_TRACKING`
 * is the baby born before SHK was tracked here, whose backfilled first sample
 * (P25-T10) would otherwise sit as OVERDUE forever with nobody able to say
 * whether it was ever done.
 */
export const shkNotScreenedReasonSchema = z.enum([
  'PARENT_DECLINED',
  'SCREENED_ELSEWHERE',
  'INFANT_DIED',
  'LOST_TO_FOLLOW_UP',
  'RECORDED_BEFORE_TRACKING',
  'OTHER',
]);

export type ShkNotScreenedReasonValue = z.infer<typeof shkNotScreenedReasonSchema>;

/**
 * Where one sample stands, derived from its window and its timestamps and
 * never stored: `DUE` turns into `OVERDUE` by the clock alone, and a stored
 * status would be wrong the moment nobody wrote to it. `NOT_SCREENED` is a
 * sample closed without a heel prick (P25-T18), and outranks the clock too.
 */
export const shkScreeningStatusSchema = z.enum([
  'UPCOMING',
  'DUE',
  'OVERDUE',
  'TAKEN',
  'SENT',
  'RESULTED',
  'NOT_SCREENED',
]);

export type ShkScreeningStatusValue = z.infer<typeof shkScreeningStatusSchema>;

/**
 * The worklist's filters. `DUE` and `OVERDUE` are untaken samples by window;
 * `AWAITING_RESULT` is a sample taken (sent or not) with no answer yet;
 * `RECALL` is an open repeat sample — sequence 2 onwards, not yet resulted.
 */
export const shkWorklistFilterSchema = z.enum(['DUE', 'OVERDUE', 'AWAITING_RESULT', 'RECALL']);

export type ShkWorklistFilterValue = z.infer<typeof shkWorklistFilterSchema>;

export const listShkScreeningsQuerySchema = z.object({
  status: shkWorklistFilterSchema.optional(),
});

export type ListShkScreeningsQuery = z.infer<typeof listShkScreeningsQuerySchema>;

/** The heel prick was done. An overdue sample is still recorded, never refused. */
export const recordShkSampleSchema = z.object({
  takenAt: z.string().datetime(),
});

export type RecordShkSampleInput = z.infer<typeof recordShkSampleSchema>;

/** The card left the clinic for the referral laboratory. */
export const recordShkSentSchema = z.object({
  sentAt: z.string().datetime(),
  laboratoryName: z.string().trim().min(1).max(200),
});

export type RecordShkSentInput = z.infer<typeof recordShkSentSchema>;

/** The laboratory answered. `RECALL` and `INVALID_SAMPLE` open the next sample. */
export const recordShkResultSchema = z.object({
  receivedAt: z.string().datetime(),
  result: shkResultSchema,
  notes: z.string().trim().max(2000).nullish(),
});

export type RecordShkResultInput = z.infer<typeof recordShkResultSchema>;

/**
 * Closes an untaken sample without a heel prick (P25-T18). `OTHER` must say
 * why in `notes`: a bare "other" would be the one reason nobody can audit.
 */
export const recordShkNotScreenedSchema = z
  .object({
    reason: shkNotScreenedReasonSchema,
    notes: z.string().trim().max(2000).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === 'OTHER' && (value.notes ?? '').length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Explain why the sample was not taken',
      });
    }
  });

export type RecordShkNotScreenedInput = z.infer<typeof recordShkNotScreenedSchema>;
