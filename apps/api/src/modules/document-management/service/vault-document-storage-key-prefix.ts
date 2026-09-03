import { VaultDocumentOwnerTypeValue } from '@hms/shared-types';

/**
 * Where a doctor's own paperwork lives in the bucket (`P16-T16`).
 *
 * The `vault/` segment is what separates these objects from the personal
 * knowledge base under `documents/{ownerType}/`, and it is load-bearing: the
 * confirm step proves a caller-supplied key against exactly one of these
 * prefixes, so a knowledge-base key can never be confirmed into the vault or
 * the other way round. Those two surfaces have opposite rules about who sees
 * the bytes — a KB document's passages are sent to the AI provider, a vault
 * document's never leave the bucket — and a shared prefix would make the
 * difference a matter of which column happened to be written.
 *
 * The owner type is in the key for the same reason it is in the knowledge
 * base's: without it a doctor could confirm against a key minted under an
 * admin's prefix. The owner's user id is deliberately *not* — object keys
 * reach logs, referrer headers and backups, and a key that identifies a
 * person turns each of those into a disclosure about whose documents these
 * are. Ownership lives in the `owner_id` column, which is also the only place
 * the vault queries read it from.
 */
export function buildVaultDocumentStorageKeyPrefix(
  ownerType: VaultDocumentOwnerTypeValue,
): string {
  return `documents/vault/${ownerType.toLowerCase()}`;
}
