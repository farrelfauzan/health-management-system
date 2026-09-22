import { z } from 'zod';

/** A calendar month, `YYYY-MM`, read in the clinic's timezone (P25-T15). */
export const maternalReportMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/**
 * How the report is answered: the JSON preview by default, or the file the
 * puskesmas takes. No spreadsheet format on purpose — a separate decision, and
 * every API dependency must stay CommonJS (D-040).
 */
export const maternalReportFormatSchema = z.enum(['json', 'csv', 'pdf']);

export type MaternalReportFormatValue = z.infer<typeof maternalReportFormatSchema>;

/** The three registers and the two monthly reports the module produces. */
export const maternalReportKindSchema = z.enum([
  'kohort-ibu',
  'kohort-bayi',
  'kohort-kb',
  'monthly-kia',
  'births-deaths',
]);

export type MaternalReportKindValue = z.infer<typeof maternalReportKindSchema>;

export const kohortRegisterKindSchema = z.enum(['kohort-ibu', 'kohort-bayi', 'kohort-kb']);

export type KohortRegisterKindValue = z.infer<typeof kohortRegisterKindSchema>;

/**
 * A register month, optionally narrowed to one desa/kelurahan by its
 * Kemendagri code. Omitted, every village is listed and the mothers without
 * a recorded village fall into the "Tanpa desa" group.
 */
export const kohortRegisterQuerySchema = z.object({
  month: maternalReportMonthSchema,
  villageCode: z.string().trim().min(1).max(20).optional(),
  format: maternalReportFormatSchema.optional(),
});

export type KohortRegisterQueryInput = z.infer<typeof kohortRegisterQuerySchema>;

export const monthlyMaternalReportQuerySchema = z.object({
  month: maternalReportMonthSchema,
  format: maternalReportFormatSchema.optional(),
});

export type MonthlyMaternalReportQueryInput = z.infer<typeof monthlyMaternalReportQuerySchema>;
