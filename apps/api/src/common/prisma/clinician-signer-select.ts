import { Prisma } from '../../generated/prisma/client';
import { CLINICIAN_NAME_SELECT } from './clinician-name-select';

/**
 * The columns a printed clinical letter's signature block reads from a
 * `DoctorProfile`: the name, the profession the line above the signature
 * names, the flat licence number (the STR, per D-032) and the practice
 * licences on file (SIP, or a midwife's SIPB), latest expiry first.
 *
 * Framework internals, like `clinician-name-select.ts`: a Prisma `select` has
 * no business in the shared package the web app consumes. Every module that
 * prints a letter selects through this, so a resep, a surat pengantar and a
 * surat rujukan cannot disagree about which licence a clinician signs under.
 */
export const CLINICIAN_SIGNER_SELECT = {
  ...CLINICIAN_NAME_SELECT,
  profession: true,
  licenseNumber: true,
  licenses: {
    where: { type: 'SIP', deletedAt: null },
    orderBy: [{ expiresAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: { licenseNumber: true, expiresAt: true },
  },
} satisfies Prisma.DoctorProfileSelect;
