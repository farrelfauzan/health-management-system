/**
 * The three columns {@link resolveUserDisplayName} reads, selected together so
 * no display site can ask for the email and forget the name (P20-T06).
 *
 * Framework internals, like `prisma.types.ts`: it describes a Prisma `select`
 * and has no business in the shared package the web app consumes.
 */
export const USER_DISPLAY_NAME_SELECT = {
  email: true,
  fullName: true,
  doctorProfile: { select: { fullName: true } },
} as const;
