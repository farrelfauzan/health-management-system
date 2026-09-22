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

/**
 * Refuses a practitioner IHS number sent with a doctor create or update
 * (P21-T08). It used to be stored exactly as sent, and a mistyped id files every
 * later encounter under somebody else's national record. The only ways in are
 * the NIK link and the verified manual link under `/satusehat/doctors`.
 *
 * Checked on the raw input, before the object strips unknown keys, so the field
 * is refused rather than silently dropped. It is kept out of the object shape
 * on purpose: declaring it as `z.never()` renders a property with no valid type
 * into the OpenAPI contract, and Orval refuses to generate from it.
 */
function refuseUnverifiedPractitionerId(input: unknown, ctx: z.RefinementCtx): unknown {
  if (typeof input === 'object' && input !== null && 'satusehatPractitionerId' in input) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['satusehatPractitionerId'],
      message:
        'satusehatPractitionerId cannot be set directly; link the doctor through SATUSEHAT instead',
    });
  }
  return input;
}

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

/**
 * What kind of clinician a profile belongs to (D-034, P24-T02). A midwife is a
 * profession on the clinician profile, not a second aggregate, so every
 * foreign key and access check that keys on the profile works for both.
 */
export const CLINICIAN_PROFESSIONS = ['DOCTOR', 'MIDWIFE'] as const;

export const clinicianProfessionSchema = z.enum(CLINICIAN_PROFESSIONS);

export type ClinicianProfessionValue = z.infer<typeof clinicianProfessionSchema>;

/**
 * The role a clinician's account is invited into or granted, by profession
 * (P24-T03, FR-MW-03). Keyed on the profile so the account can never hold a
 * different kind of clinician than the record it signs in to.
 */
export const CLINICIAN_ROLE_CODE_BY_PROFESSION = {
  DOCTOR: 'DOCTOR',
  MIDWIFE: 'MIDWIFE',
} as const satisfies Record<ClinicianProfessionValue, string>;

/**
 * P24-T03 (FR-MW-03). The 422 code for a profession change on a clinician who
 * already has an encounter, an admission or a prescription.
 */
export const CLINICIAN_PROFESSION_LOCKED_ERROR_CODE = 'CLINICIAN_PROFESSION_LOCKED';

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
  /** Narrows the directory to doctors or to midwives (D-034). */
  profession: clinicianProfessionSchema.optional(),
});

/**
 * A clinician's own NPWP for the BP21 the clinic issues on their fees
 * (P27-T07). Digits only after the separators people type; 16 digits is the
 * Coretax format, 15 the legacy one, kept rather than refused. Optional: an
 * individual's NIK serves as NPWP, so the withholding draft falls back to it.
 */
export const clinicianNpwpSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .refine((value) => /^\d{15,16}$/.test(value), { message: 'NPWP must be 15 or 16 digits' });

/** The NPWP box on the clinician form: blank means none, otherwise a valid NPWP. */
export const optionalClinicianNpwpSchema = z.union([
  z.string().trim().length(0),
  clinicianNpwpSchema,
]);

export const createDoctorSchema = z.object({
  licenseNumber: z.string().trim().min(3).max(64),
  fullName: z.string().trim().min(2).max(120),
  specialtyId: z.string().uuid(),
  /** Doctor or midwife (D-034). Omitted means DOCTOR, as before P24-T03. */
  profession: clinicianProfessionSchema.optional(),
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
  npwp: clinicianNpwpSchema.optional(),
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
    /** Refused with 422 once the clinician has clinical history (P24-T03). */
    profession: clinicianProfessionSchema.optional(),
    phoneNumber: indonesianPhoneNumberSchema.optional(),
    title: doctorTitleSchema.nullable().optional(),
    degrees: doctorDegreesSchema.nullable().optional(),
    // Settable but not clearable: a doctor who has a NIK must keep one, or
    // their next encounter silently becomes unreportable (SJ-75).
    nik: nikSchema.optional(),
    /** Clearable, unlike the NIK: `null` removes a wrongly entered NPWP (P27-T07). */
    npwp: clinicianNpwpSchema.nullable().optional(),
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

/**
 * The bodies the doctor create and update routes validate (P21-T08): the same
 * schemas plus the refusal of a raw practitioner IHS number. Kept apart from
 * `createDoctorSchema`, whose `.shape` the web forms read field by field, which
 * a preprocess wrapper would hide.
 */
export const createDoctorRequestSchema = z.preprocess(
  refuseUnverifiedPractitionerId,
  createDoctorSchema,
);

export const updateDoctorRequestSchema = z.preprocess(
  refuseUnverifiedPractitionerId,
  updateDoctorSchema,
);
export type UpdateOwnDoctorProfileInput = z.infer<typeof updateOwnDoctorProfileSchema>;
export type CompleteOwnDoctorProfileInput = z.infer<typeof completeOwnDoctorProfileSchema>;

/**
 * What a midwife may do beyond her own authority — *kewenangan* (P25-T02).
 * Kept as they were by D-036 (`docs/post-mvp/decisions.md`): which actions
 * need an authority is still the Permenkes 28/2017 Pasal 25 list, which
 * Permenkes 13/2025 Pasal 305(1) keeps as the reference although 28/2017 is
 * revoked (Pasal 309 huruf cc). The grant itself rests on PP 28/2024 Pasal 744
 * and Permenkes 13/2025 Pasal 185–187 (programme and no-other-worker
 * authority) or PP 28/2024 Pasal 742(3)–(4) (training-added competence on the
 * STR). "Authority" rather than "authorization" because the repo already uses
 * the latter for RBAC.
 */
export const DOCTOR_AUTHORITY_KINDS = [
  'IUD_IMPLANT',
  'MTBS',
  'PROGRAM_IMMUNIZATION',
  'INTEGRATED_ANC',
  'NO_OTHER_WORKER',
] as const;

export const doctorAuthorityKindSchema = z.enum(DOCTOR_AUTHORITY_KINDS);

export type DoctorAuthorityKindValue = z.infer<typeof doctorAuthorityKindSchema>;

/**
 * The evidence a grant rests on — exactly one per authority (D-036):
 * - `DINAS_PENETAPAN`: a penetapan by the kepala dinas kesehatan
 *   kabupaten/kota, e.g. that no other health worker is available
 *   (PP 28/2024 Pasal 744(3), Permenkes 13/2025 Pasal 186).
 * - `GOVERNMENT_PENUGASAN`: a penugasan by central or regional government for
 *   a programme need, given after training (Permenkes 13/2025 Pasal 187(2)).
 * - `STR_ANNOTATION`: a competence added through training and written on the
 *   STR (PP 28/2024 Pasal 742(3)–(4)).
 */
export const DOCTOR_AUTHORITY_GRANT_KINDS = [
  'DINAS_PENETAPAN',
  'GOVERNMENT_PENUGASAN',
  'STR_ANNOTATION',
] as const;

export const doctorAuthorityGrantKindSchema = z.enum(DOCTOR_AUTHORITY_GRANT_KINDS);

export type DoctorAuthorityGrantKindValue = z.infer<typeof doctorAuthorityGrantKindSchema>;

/** The authority can only hang off a `MIDWIFE` profile (422). */
export const DOCTOR_AUTHORITY_REQUIRES_MIDWIFE_ERROR_CODE = 'DOCTOR_AUTHORITY_REQUIRES_MIDWIFE';

/** A live (unrevoked, undeleted) authority of that kind already exists (409). */
export const DOCTOR_AUTHORITY_ALREADY_ACTIVE_ERROR_CODE = 'DOCTOR_AUTHORITY_ALREADY_ACTIVE';

/**
 * A midwife tried something that needs a delegated authority she does not
 * hold on that day (P25-T03, 422, `details.kind` names it). The basis is PP
 * 28/2024 Pasal 744 (D-036), not the revoked Permenkes 28/2017 Pasal 23.
 */
export const MIDWIFE_AUTHORITY_REQUIRED_ERROR_CODE = 'MIDWIFE_AUTHORITY_REQUIRED';

/**
 * What a grant document may be uploaded as. Narrower than storage's own list
 * on purpose — a surface narrows what storage accepts, never widens it — and
 * no text types, because a penetapan, a penugasan letter or an STR is a PDF or
 * a photograph.
 */
export const DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const doctorAuthorityGrantDocumentMimeTypeSchema = z.enum(
  DOCTOR_AUTHORITY_GRANT_DOCUMENT_MIME_TYPES,
);

export type DoctorAuthorityGrantDocumentMimeTypeValue = z.infer<
  typeof doctorAuthorityGrantDocumentMimeTypeSchema
>;

export const DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** The object-key prefix every grant document upload is minted under, per clinician. */
export const DOCTOR_AUTHORITY_GRANT_DOCUMENT_KEY_ROOT = 'doctor-authorities';

/** The same, for the written instruction behind a pelimpahan (P25-T05). */
export const DOCTOR_MANDATE_INSTRUCTION_KEY_ROOT = 'doctor-mandates';

const grantDocumentStorageKeySchema = z.string().trim().min(1).max(512);

const authorityReferenceSchema = z.string().trim().min(1).max(128);

function hasValidityOrder(input: {
  validFrom?: string | undefined;
  validUntil?: string | undefined;
}): boolean {
  if (!input.validFrom || !input.validUntil) {
    return true;
  }
  return input.validUntil >= input.validFrom;
}

/**
 * Grants one authority. Everything but the document is required: the training
 * certificate always, because training is the precondition of every grant
 * (PP 28/2024 Pasal 744(4), Permenkes 13/2025 Pasal 186(2) and 187(2)), and an
 * end date always, because the government sets the period (PP 28/2024 Pasal
 * 744(8)) — there is no open-ended grant (D-036).
 */
export const createDoctorAuthoritySchema = z
  .object({
    kind: doctorAuthorityKindSchema,
    grantKind: doctorAuthorityGrantKindSchema,
    /** The penetapan number, the penugasan letter number, or the STR number. */
    grantReference: authorityReferenceSchema,
    grantIssuedAt: licenseDateSchema,
    trainingCertificateNumber: authorityReferenceSchema,
    validFrom: licenseDateSchema,
    validUntil: licenseDateSchema,
    /** A key minted by the upload-url route; the document itself is optional. */
    grantDocumentStorageKey: grantDocumentStorageKeySchema.optional(),
  })
  .refine(hasValidityOrder, {
    message: 'validUntil must be on or after validFrom',
    path: ['validUntil'],
  });

export type CreateDoctorAuthorityInput = z.infer<typeof createDoctorAuthoritySchema>;

/**
 * Edits the evidence and the dates — never `kind`. Changing what an authority
 * *is* is a revoke and a fresh grant, so the audit trail keeps both. The end
 * date can move but cannot be cleared; `grantDocumentStorageKey: null`
 * detaches the document.
 */
export const updateDoctorAuthoritySchema = z
  .object({
    grantKind: doctorAuthorityGrantKindSchema.optional(),
    grantReference: authorityReferenceSchema.optional(),
    grantIssuedAt: licenseDateSchema.optional(),
    trainingCertificateNumber: authorityReferenceSchema.optional(),
    validFrom: licenseDateSchema.optional(),
    validUntil: licenseDateSchema.optional(),
    grantDocumentStorageKey: grantDocumentStorageKeySchema.nullable().optional(),
  })
  .strict()
  .refine(hasValidityOrder, {
    message: 'validUntil must be on or after validFrom',
    path: ['validUntil'],
  });

export type UpdateDoctorAuthorityInput = z.infer<typeof updateDoctorAuthoritySchema>;

export const revokeDoctorAuthoritySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type RevokeDoctorAuthorityInput = z.infer<typeof revokeDoctorAuthoritySchema>;

/**
 * The two forms a doctor's pelimpahan takes (P25-T05, D-036). Permenkes
 * 28/2017 Pasal 27 is revoked; PP 28/2024 Pasal 745 and Permenkes 13/2025
 * Pasal 184 replace it, and they are not one thing:
 *
 * - `MANDATE` (*mandat*): responsibility stays with the doctor, who
 *   supervises. The everyday form.
 * - `DELEGATION` (*delegasi*): responsibility moves to the midwife, and it is
 *   valid only while the doctor is away — PP 28/2024 Pasal 745(3) puts that
 *   at one to three months.
 *
 * Both are written, and both are reported back to the doctor. Which one it
 * was decides who answers for the action, so it is shown on every procedure
 * performed under it rather than being an administrative detail.
 */
export const DOCTOR_MANDATE_KINDS = ['MANDATE', 'DELEGATION'] as const;

export const doctorMandateKindSchema = z.enum(DOCTOR_MANDATE_KINDS);

export type DoctorMandateKindValue = z.infer<typeof doctorMandateKindSchema>;

/**
 * The parties are wrong: the midwife profile must be a `MIDWIFE`, the
 * mandating profile an active `DOCTOR`, and they must be different (422).
 */
export const DOCTOR_MANDATE_INVALID_PARTIES_ERROR_CODE = 'DOCTOR_MANDATE_INVALID_PARTIES';

/**
 * A pelimpahan is written (PP 28/2024 Pasal 745(2)), so the instruction file
 * is required — a mandate nobody signed is a conversation (422).
 */
export const DOCTOR_MANDATE_INSTRUCTION_REQUIRED_ERROR_CODE = 'DOCTOR_MANDATE_INSTRUCTION_REQUIRED';

/**
 * Warnings a mandate may carry without being refused (D-036 §3). The "same
 * FKTP" and "never continuous" rules of the revoked Pasal 27 are no longer
 * hard law, so they inform rather than block — and a delegation outside the
 * 1–3 month window is a fact about the doctor's absence, not a validation
 * error we can adjudicate.
 */
export const DOCTOR_MANDATE_POLICY_WARNINGS = [
  'DELEGATION_OUTSIDE_ABSENCE_WINDOW',
  'OVERLAPS_EXISTING_MANDATE',
] as const;

export const doctorMandatePolicyWarningSchema = z.enum(DOCTOR_MANDATE_POLICY_WARNINGS);

export type DoctorMandatePolicyWarningValue = z.infer<typeof doctorMandatePolicyWarningSchema>;

/** PP 28/2024 Pasal 745(3): a delegation covers an absence of 1–3 months. */
export const DELEGATION_MIN_ABSENCE_DAYS = 30;
export const DELEGATION_MAX_ABSENCE_DAYS = 92;

export const MAX_MANDATE_PROCEDURE_CODES = 50;

/**
 * Records one pelimpahan (P25-T05, FR-AUTH-04).
 *
 * `icd9cmCodes` is the point of the record: a mandate names the actions it
 * covers, so the procedure gate can tell one that is covered from one that is
 * not. At least one, because a mandate for nothing is not a mandate.
 *
 * `validUntil` is required, like every authority (D-036 §4): a pelimpahan runs
 * for as long as the doctor said and no longer. The regulation sets no maximum
 * duration, so none is imposed here — an open question for product, recorded
 * in the P25 addendum rather than invented in code.
 */
export const createDoctorMandateSchema = z
  .object({
    kind: doctorMandateKindSchema,
    mandatingDoctorId: z.string().uuid(),
    instruction: z.string().trim().min(3).max(2000),
    icd9cmCodes: z
      .array(z.string().trim().min(1).max(16))
      .min(1)
      .max(MAX_MANDATE_PROCEDURE_CODES)
      .refine((codes) => new Set(codes).size === codes.length, 'Procedure codes must be unique'),
    validFrom: licenseDateSchema,
    validUntil: licenseDateSchema,
    /** A key minted by the upload-url route. Required: the writing is the law. */
    instructionStorageKey: grantDocumentStorageKeySchema,
  })
  .refine(hasValidityOrder, {
    message: 'validUntil must be on or after validFrom',
    path: ['validUntil'],
  });

export type CreateDoctorMandateInput = z.infer<typeof createDoctorMandateSchema>;

export const revokeDoctorMandateSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type RevokeDoctorMandateInput = z.infer<typeof revokeDoctorMandateSchema>;

export const createDoctorAuthorityUploadUrlSchema = z.object({
  mimeType: doctorAuthorityGrantDocumentMimeTypeSchema,
  sizeBytes: z.coerce.number().int().positive().max(DOCTOR_AUTHORITY_GRANT_DOCUMENT_MAX_SIZE_BYTES),
});

export type CreateDoctorAuthorityUploadUrlInput = z.infer<
  typeof createDoctorAuthorityUploadUrlSchema
>;
