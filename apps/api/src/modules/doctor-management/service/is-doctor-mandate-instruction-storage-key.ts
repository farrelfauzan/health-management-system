import { buildDoctorMandateInstructionKeyPrefix } from './build-doctor-mandate-instruction-key-prefix';

const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Whether a key is one the upload-url route minted for *this* midwife
 * (P25-T05). The create route is where a caller-supplied key reaches storage,
 * so it is proven rather than trusted: a vault key, a grant document, or
 * another midwife's instruction are all refused.
 */
export function isDoctorMandateInstructionStorageKey(
  storageKey: string,
  midwifeDoctorId: string,
): boolean {
  const prefix = buildDoctorMandateInstructionKeyPrefix(midwifeDoctorId);
  return new RegExp(`^${prefix}/${UUID_SEGMENT}(?:\\.[a-z0-9]{1,10})?$`).test(storageKey);
}
