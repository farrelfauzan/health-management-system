import type { DocumentContentModeValue } from '@hms/shared-types';

export type ManagedDocumentContentChoice = 'draft' | 'upload';

/**
 * Which body control the form shows for a type (FR-E5-35): the editor for
 * DRAFTED, the file picker for UPLOADED, and — for EITHER — whichever the
 * drafter picked, defaulting to the editor. Returns null when the type has
 * not been chosen yet, so the form shows nothing rather than guessing.
 */
export function resolveContentChoice(
  contentMode: DocumentContentModeValue | null,
  picked: ManagedDocumentContentChoice,
): ManagedDocumentContentChoice | null {
  if (contentMode === null) {
    return null;
  }
  if (contentMode === 'DRAFTED') {
    return 'draft';
  }
  if (contentMode === 'UPLOADED') {
    return 'upload';
  }
  return picked;
}
