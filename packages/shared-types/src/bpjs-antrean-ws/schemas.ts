import { z } from 'zod';

/**
 * Request schemas for the **inbound** Antrean Online web services — the six
 * calls BPJS makes *into* the facility (P14-T04). Everything in this file is
 * spike question Q5 wearing executable code: the field names come from the
 * circulated *Dokumen UAT Bridging Antrol v2.0 FKTP* and the community
 * reference implementations listed in `docs/post-mvp/bpjs-antrean-online.md`
 * §8, and **none of them has been confirmed against a live BPJS caller**.
 *
 * Two consequences worth stating where the schemas live rather than in a
 * document nobody opens while debugging a UAT failure:
 *
 * - Every schema is `.passthrough()`-free and therefore **strips** unknown
 *   keys rather than rejecting them. A field BPJS sends that HMS has not
 *   modelled must not turn into a 400 during UAT — the call still has to do
 *   the right thing with the fields both sides agree on.
 * - Identifiers arrive as digit strings and are normalised, never coerced to
 *   numbers. A `nomorkartu` with a leading zero is a different member from the
 *   same digits without it, and JSON numbers lose that.
 */

/** Digits-only normaliser, mirroring `normaliseIdentifierDigits` in patient-management. */
function toDigits(value: string): string {
  return value.replace(/\D/g, '');
}

const digitsSchema = (length: number, label: string) =>
  z
    .string()
    .trim()
    .transform(toDigits)
    .refine(
      (digits) => digits.length === length,
      `${label} must contain exactly ${length} digits`,
    );

export const antreanCalendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD calendar date');

/**
 * `jampraktek` as BPJS sends it: `HH:mm-HH:mm`. HMS stores a session's window
 * as two separate `HH:mm` strings on `DoctorSchedule`, so the pair is split
 * here once and matched on the start time — the end time is carried for the
 * mismatch message, not for lookup, because HFIS and HMS can legitimately
 * disagree on when a shift ends while agreeing on when it starts.
 */
export const antreanPracticeWindowSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'Expected a HH:mm-HH:mm practice window');

export const antreanCardNumberSchema = digitsSchema(13, 'nomorkartu');
export const antreanNikSchema = digitsSchema(16, 'nik');

/**
 * Q4. The credential pair BPJS presents to the facility's token endpoint. The
 * username is compared verbatim; the password is verified against the bcrypt
 * hash stored by P14-T03 and is never read back.
 */
export const antreanInboundTokenRequestSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export type AntreanInboundTokenRequest = z.infer<typeof antreanInboundTokenRequestSchema>;

/** Q5. Per poli/doctor/date: what number is being served and how many remain. */
export const antreanStatusRequestSchema = z.object({
  kodepoli: z.string().trim().min(1).max(32),
  kodedokter: z.string().trim().min(1).max(32),
  tanggalperiksa: antreanCalendarDateSchema,
  jampraktek: antreanPracticeWindowSchema,
});

export type AntreanStatusRequest = z.infer<typeof antreanStatusRequestSchema>;

/**
 * Q5. The booking write. This is one of the two calls that mutate clinical
 * master data from the public internet — `norm` is optional because a member
 * booking for the first time has no MRN at this clinic yet, and BPJS is
 * expected to have called `pasien baru` first when it is absent.
 */
export const antreanTakeRequestSchema = z.object({
  kodepoli: z.string().trim().min(1).max(32),
  kodedokter: z.string().trim().min(1).max(32),
  tanggalperiksa: antreanCalendarDateSchema,
  jampraktek: antreanPracticeWindowSchema,
  nomorkartu: antreanCardNumberSchema,
  nik: antreanNikSchema,
  nohp: z.string().trim().min(6).max(32),
  norm: z.string().trim().min(1).max(32).optional(),
  jeniskunjungan: z.coerce.number().int().min(1).max(4).optional(),
  nomorreferensi: z.string().trim().max(64).optional(),
  keterangan: z.string().trim().max(255).optional(),
});

export type AntreanTakeRequest = z.infer<typeof antreanTakeRequestSchema>;

/** Q5/Q10. One member's own booking, addressed by the booking code BPJS holds. */
export const antreanRemainingRequestSchema = z.object({
  kodebooking: z.string().trim().min(1).max(64),
});

export type AntreanRemainingRequest = z.infer<typeof antreanRemainingRequestSchema>;

/** Q5. Cancels that booking. `keterangan` is BPJS's reason and is preserved verbatim. */
export const antreanCancelRequestSchema = z.object({
  kodebooking: z.string().trim().min(1).max(64),
  keterangan: z.string().trim().min(1).max(255),
});

export type AntreanCancelRequest = z.infer<typeof antreanCancelRequestSchema>;

/**
 * Q5. Registers a member who has no record at this clinic. `jeniskelamin` is
 * BPJS's single-letter sex code; `tanggallahir` is a calendar date. Address is
 * accepted as one free-text line because HMS stores it that way — the
 * administrative-region codes BPJS may also send are deliberately not modelled
 * rather than stored somewhere they would never be read.
 */
export const antreanNewPatientRequestSchema = z.object({
  nomorkartu: antreanCardNumberSchema,
  nik: antreanNikSchema,
  nama: z.string().trim().min(2).max(120),
  jeniskelamin: z.enum(['L', 'P']),
  tanggallahir: antreanCalendarDateSchema,
  nohp: z.string().trim().min(6).max(32),
  alamat: z.string().trim().min(3).max(300),
});

export type AntreanNewPatientRequest = z.infer<typeof antreanNewPatientRequestSchema>;
