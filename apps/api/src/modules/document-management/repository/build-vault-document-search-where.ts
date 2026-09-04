import type { Prisma } from '../../../generated/prisma/client';

/**
 * The free-text half of a vault listing's `where` (FR-E3-03).
 *
 * Title and reference number only. Those are the two things an owner types
 * when they mean "the STR one" or "the 2024 contract"; the storage key and
 * MIME type are not things a person searches by, and matching on them would
 * only make a search return rows the owner could not see why it returned.
 *
 * Returned as a spread-able fragment so the owner predicate stays where it is
 * in the caller — this narrows one vault, it never selects which vault.
 */
export function buildVaultDocumentSearchWhere(search?: string): Prisma.DocumentWhereInput {
  if (search === undefined || search.length === 0) {
    return {};
  }
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
    ],
  };
}
