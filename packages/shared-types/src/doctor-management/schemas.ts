import { z } from 'zod';

// The canonical NIK validator lives with the patient domain because patients
// adopted national identifiers first; practitioners share the exact same
// 16-digit Dukcapil format, so reuse it instead of diverging.
import {
  doctorCredentialCodeSchema,
  doctorDegreeCodesSchema,
} from '#doctor-credential-option/schemas';
import { nikSchema } from '#patient-management/schemas';
import { indonesianPhoneNumberSchema } from '#shared/phone-number-schema';

export const MAX_INITIAL_PATIENT_ASSIGNMENTS = 20;
export const MAX_SCHEDULE_ENTRIES = 28;
export const MAX_DOCTOR_LICENSES = 20;
export const MAX_DOCTOR_EDUCATIONS = 20;

const CURRENT_GRADUATION_YEAR = new Date().getUTCFullYear();
const MIN_GRADUATION_YEAR = 1950;

export const licenseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine(isValidLicenseDate, 'Date must be a valid calendar date');

function isValidLicenseDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

/**
 * Practitioner credential types on Indonesian licensing documents: STR (Surat
 * Tanda Registrasi — lifetime under UU Kesehatan No. 17/2023) and SIP (Surat
 * Izin Praktik — per practice location, time-limited).
 */
export const DOCTOR_LICENSE_TYPES = ['STR', 'SIP'] as const;

export const doctorLicenseTypeSchema = z.enum(DOCTOR_LICENSE_TYPES);

export type DoctorLicenseTypeValue = z.infer<typeof doctorLicenseTypeSchema>;

export const doctorLicenseInputSchema = z
  .object({
    type: doctorLicenseTypeSchema,
    licenseNumber: z.string().trim().min(3).max(64),
    issuedAt: licenseDateSchema.optional(),
    expiresAt: licenseDateSchema.optional(),
  })
  .refine(
    (license) => !license.issuedAt || !license.expiresAt || license.issuedAt <= license.expiresAt,
    'issuedAt must be before or equal to expiresAt',
  );

export const doctorLicensesSchema = z
  .array(doctorLicenseInputSchema)
  .max(MAX_DOCTOR_LICENSES)
  .refine(
    (licenses) =>
      new Set(licenses.map((license) => `${license.type}:${license.licenseNumber.toLowerCase()}`))
        .size === licenses.length,
    'License numbers must be unique per license type',
  );

export type DoctorLicenseInput = z.infer<typeof doctorLicenseInputSchema>;

export const satusehatPractitionerIdSchema = z.string().trim().min(1).max(64);

/**
 * Titles, degrees and fields of study are picked from the
 * `DoctorCredentialOption` catalog since P19-T14, so what crosses the wire is
 * an option code and no longer whatever the person typed. The API rejects a
 * code that does not name a live option, which is what stops the same
 * credential reaching a document spelled five different ways.
 */
export const doctorTitleSchema = doctorCredentialCodeSchema;
export const doctorDegreesSchema = doctorDegreeCodesSchema;

export const doctorEducationInputSchema = z.object({
  institution: z.string().trim().min(2).max(160),
  // Free text on purpose, unlike the profile's `degrees`: this is the award the
  // institution granted on a specific programme, and clinics enter it straight
  // off the diploma. Only the field of study is catalogued (P19-T14).
  degree: z.string().trim().min(1).max(80),
  fieldOfStudy: doctorCredentialCodeSchema.optional(),
  graduationYear: z
    .number()
    .int()
    .min(MIN_GRADUATION_YEAR)
    .max(CURRENT_GRADUATION_YEAR + 1)
    .optional(),
});

export const doctorEducationsSchema = z
  .array(doctorEducationInputSchema)
  .max(MAX_DOCTOR_EDUCATIONS)
  .refine(
    (educations) =>
      new Set(
        educations.map(
          (education) =>
            `${education.institution.toLowerCase()}|${education.degree.toLowerCase()}|${education.fieldOfStudy?.toLowerCase() ?? ''}|${education.graduationYear ?? ''}`,
        ),
      ).size === educations.length,
    'Education entries must be unique',
  );

export type DoctorEducationInput = z.infer<typeof doctorEducationInputSchema>;

export const scheduleTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use HH:MM 24-hour format');

export type ScheduleOverlapEntry = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable?: boolean;
};

export function hasScheduleOverlap(entries: ScheduleOverlapEntry[]): boolean {
  const availableEntries = entries.filter((entry) => entry.isAvailable !== false);
  const entriesByDay = new Map<number, ScheduleOverlapEntry[]>();
  for (const entry of availableEntries) {
    const dayEntries = entriesByDay.get(entry.dayOfWeek) ?? [];
    dayEntries.push(entry);
    entriesByDay.set(entry.dayOfWeek, dayEntries);
  }
  for (const dayEntries of entriesByDay.values()) {
    const sortedEntries = [...dayEntries].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sortedEntries.length; i += 1) {
      const previousEntry = sortedEntries[i - 1];
      const currentEntry = sortedEntries[i];
      if (previousEntry && currentEntry && currentEntry.startTime < previousEntry.endTime) {
        return true;
      }
    }
  }
  return false;
}

export const doctorScheduleEntrySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: scheduleTimeSchema,
    endTime: scheduleTimeSchema,
    isAvailable: z.boolean().optional().default(true),
    maxPatients: z.number().int().min(1).nullable().optional(),
  })
  .refine((entry) => entry.startTime < entry.endTime, {
    message: 'startTime must be earlier than endTime',
  });

export const updateDoctorScheduleSchema = z
  .object({
    schedules: z.array(doctorScheduleEntrySchema).max(MAX_SCHEDULE_ENTRIES),
  })
  .refine((payload) => !hasScheduleOverlap(payload.schedules), {
    message: 'Schedule entries must not overlap on the same day',
  });

/**
 * Whether a doctor can sign in yet (P19-T15, P20-T01).
 *
 * Deliberately three states rather than the four `UserInvitationStatusValue`
 * carries. This answers one question a directory row has room for — "does this
 * doctor have a working login" — and both a withdrawn and a lapsed invitation
 * answer it the same way as never having been invited: no account and no live
 * link, which is `NO_ACCOUNT`. That state used to be expressed by leaving the
 * field out; since every new doctor is created with an address (P20-T01) it is
 * the exception that needs action, so it is named rather than blank. The
 * four-state view of an individual invitation stays on the Administration
 * invitations screen, which is where the resend button lives.
 */
export const DOCTOR_INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'NO_ACCOUNT'] as const;

export type DoctorInvitationStatusValue = (typeof DOCTOR_INVITATION_STATUSES)[number];

/** The address a doctor signs in with (P19-T15). See `createDoctorSchema`. */
export const doctorEmailSchema = z.string().trim().toLowerCase().email().max(255);

export const listDoctorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  specialtyId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  // Finds the doctors whose encounters cannot reach SATUSEHAT at all, so the
  // gap is visible on the directory before a submission fails permanently
  // (SJ-75). Query strings are always text, so the wire form stays an enum and
  // coerces here — same shape as `isActive`.
  missingNik: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createDoctorSchema = z.object({
  licenseNumber: z.string().trim().min(3).max(64),
  fullName: z.string().trim().min(2).max(120),
  specialtyId: z.string().uuid(),
  // SATUSEHAT Practitioner requires at least one ContactPoint, and phone is
  // the one the profile owns — the email lives on the user account.
  phoneNumber: indonesianPhoneNumberSchema,
  // The address the doctor signs in with. Required since P20-T01: a doctor is
  // always somebody who can log in, so every create either invites a new
  // address or attaches the account that already holds it (P19-T15). Still
  // not a column on `DoctorProfile` — the address is collected here and owned
  // by `User`. There is no counterpart on `updateDoctorSchema`: changing a
  // sign-in address stays an Administration action, so the edit form reads it
  // back and never writes it.
  //
  // There is no `ownerUserId` beside it any more. It used to be the way to
  // attach a known account, but an address already does that — an existing
  // account is found by its email and attached — so keeping both meant two
  // ways to name one user and a refusal whenever they disagreed.
  email: doctorEmailSchema,
  title: doctorTitleSchema.optional(),
  degrees: doctorDegreesSchema.optional(),
  // Required. The IHS practitioner number is resolved from the master
  // practitioner index by NIK and nothing else, so a doctor without one can
  // never have their encounters reported to SATUSEHAT — and the failure is
  // permanent, not retryable (SJ-75). Legacy rows predating this rule may still
  // hold null; `listDoctorsQuerySchema.missingNik` is how they are found.
  nik: nikSchema,
  satusehatPractitionerId: satusehatPractitionerIdSchema.optional(),
  licenses: doctorLicensesSchema.optional(),
  educations: doctorEducationsSchema.optional(),
  isActive: z.boolean().optional().default(true),
  patientIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_INITIAL_PATIENT_ASSIGNMENTS)
    .refine((ids) => new Set(ids).size === ids.length, 'Patient IDs must be unique')
    .optional(),
});

/**
 * Gives a doctor with no way to sign in an account after the fact (P20-T01).
 *
 * For doctors created before the address was required, and for those whose
 * invitation lapsed or was withdrawn. The address means exactly what it means
 * on create: a new one is invited, one that already has an account is
 * attached.
 */
export const inviteDoctorAccountSchema = z.object({
  email: doctorEmailSchema,
});

export const updateDoctorSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    specialtyId: z.string().uuid().optional(),
    phoneNumber: indonesianPhoneNumberSchema.optional(),
    title: doctorTitleSchema.nullable().optional(),
    degrees: doctorDegreesSchema.nullable().optional(),
    // Settable but not clearable: a doctor who has a NIK must keep one, or
    // their next encounter silently becomes unreportable (SJ-75).
    nik: nikSchema.optional(),
    satusehatPractitionerId: satusehatPractitionerIdSchema.nullable().optional(),
    // Replaces the whole list: the client always submits the complete set of
    // active licenses, and removed entries are soft-deleted rather than
    // dropped, so the credential history survives licensing audits.
    licenses: doctorLicensesSchema.optional(),
    // Replaces the whole list: the client submits the complete set of active
    // education rows, and removed entries are soft-deleted so the history
    // survives profile edits and SATUSEHAT qualification remaps.
    educations: doctorEducationsSchema.optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

/**
 * What a doctor may change about themselves (P20-T03, see D-025).
 *
 * Only how they are addressed and reached: name, title, degrees, phone and
 * education history. Everything else on the profile is something the clinic
 * asserts about them, not a preference — specialty and licences are
 * credentials, the NIK and the SATUSEHAT practitioner id are national
 * identity (a NIK change follows the P21-T09 unlink rule, an IHS number
 * changes only through the NIK link or the verified P21-T08 path), and
 * `isActive` / `ownerUserId` are administration.
 *
 * Deliberately its own schema rather than a pick of `updateDoctorSchema`, and
 * `strict`: an administrative field on this route is refused with a 400
 * rather than silently dropped, so a doctor who tries to change their STR is
 * told no instead of seeing a success that changed nothing.
 */
export const updateOwnDoctorProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phoneNumber: indonesianPhoneNumberSchema.optional(),
    title: doctorTitleSchema.nullable().optional(),
    degrees: doctorDegreesSchema.nullable().optional(),
    // Replaces the whole list, exactly as on the administrative route.
    educations: doctorEducationsSchema.optional(),
  })
  .strict()
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

/**
 * What the profile-completion screen submits (P20-T02, see D-026).
 *
 * Name and phone are always required — they are the doctor's own. Specialty,
 * STR licence number and NIK are optional here because what is needed depends
 * on what is already stored: an invited doctor with no profile must send all
 * three to create one, while a doctor whose profile the clinic started may
 * only fill the ones still empty. The service enforces both; a value the
 * clinic already set is refused rather than overwritten, which is how "enter
 * it once" stays compatible with D-025. `strict` for the same reason as the
 * own-profile schema.
 */
export const completeOwnDoctorProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phoneNumber: indonesianPhoneNumberSchema,
    specialtyId: z.string().uuid().optional(),
    licenseNumber: z.string().trim().min(3).max(64).optional(),
    nik: nikSchema.optional(),
    title: doctorTitleSchema.optional(),
    degrees: doctorDegreesSchema.optional(),
  })
  .strict();

export type DoctorScheduleEntryInput = z.infer<typeof doctorScheduleEntrySchema>;
export type UpdateDoctorScheduleInput = z.infer<typeof updateDoctorScheduleSchema>;
export type ListDoctorsQueryInput = z.infer<typeof listDoctorsQuerySchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type InviteDoctorAccountInput = z.infer<typeof inviteDoctorAccountSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type UpdateOwnDoctorProfileInput = z.infer<typeof updateOwnDoctorProfileSchema>;
export type CompleteOwnDoctorProfileInput = z.infer<typeof completeOwnDoctorProfileSchema>;
