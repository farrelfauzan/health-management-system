import type { SatusehatLinkNikEffect } from '#patient-management/types';

/**
 * What writing a NIK does to the patient's SATUSEHAT link (D-035, FR-NB-05).
 *
 * D-035's rule is that a changed NIK invalidates the IHS number resolved from
 * it, so the link is cleared in the same write. A newborn is the one case
 * where that is wrong: she was never resolved by NIK at all — she was created
 * on the master patient index under her mother's, and the IHS number the
 * platform assigned is hers. Her first NIK is new information about the same
 * person, so it is sent upstream as an update and the link stays.
 *
 * "Newborn" is `motherPatientId` being set, which is the same rule P24-T10
 * registers her by. It is deliberately not "young enough": a baby registered
 * under her mother stays exempt for her *first* NIK however long that takes,
 * and a second change still unlinks, because by then the link came from a NIK
 * like anyone else's.
 *
 * Compared by blind index, never by ciphertext — identifiers are re-encrypted
 * on every write, so ciphertext differs even when the value does not.
 */
export function resolveSatusehatLinkNikEffect(input: {
  hasSatusehatLink: boolean;
  motherPatientId: string | null;
  currentNikIndex: string | null;
  nextNikIndex: string | null;
}): SatusehatLinkNikEffect {
  if (!input.hasSatusehatLink || input.currentNikIndex === input.nextNikIndex) {
    return 'UNCHANGED';
  }
  const isNewbornFirstNik =
    input.motherPatientId !== null && input.currentNikIndex === null && input.nextNikIndex !== null;
  return isNewbornFirstNik ? 'NEWBORN_NIK_ADDED' : 'CLEARED';
}
