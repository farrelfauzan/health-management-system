/**
 * The columns {@link resolveClinicianName} reads from a `DoctorProfile`: the
 * profile's own name and the name on the account that owns it (P20-T07).
 *
 * Framework internals, like `user-display-name-select.ts`: a Prisma `select`
 * has no business in the shared package the web app consumes.
 */
export const CLINICIAN_NAME_SELECT = {
  fullName: true,
  ownerUser: { select: { fullName: true } },
} as const;
