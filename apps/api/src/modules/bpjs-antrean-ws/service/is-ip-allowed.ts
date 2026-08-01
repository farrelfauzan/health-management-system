import { IpAllowlistEntry, toAddressBytes } from '../../../common/bpjs-antrean/parse-ip-allowlist';

const BITS_PER_BYTE = 8;

/**
 * Whether a source address falls inside any configured range.
 *
 * **An empty allowlist matches nothing.** That is the single most important
 * line in this module: the inbound surface is a public write path, and the
 * only safe reading of "no ranges configured" is "BPJS has not told us where
 * it calls from yet" (spike question Q6), never "allow everyone".
 *
 * Address families do not cross-match — an IPv6 caller is not inside an IPv4
 * range and vice versa. IPv4-mapped IPv6 is folded to IPv4 during parsing, so
 * a dual-stack listener does not create a hole here.
 */
export function isIpAllowed(sourceAddress: string, allowlist: readonly IpAllowlistEntry[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  const sourceBytes = toAddressBytes(sourceAddress);
  if (sourceBytes === null) {
    return false;
  }
  return allowlist.some((entry) => matchesEntry(sourceBytes, entry));
}

function matchesEntry(sourceBytes: Uint8Array, entry: IpAllowlistEntry): boolean {
  if (sourceBytes.length !== entry.bytes.length) {
    return false;
  }
  const wholeBytes = Math.floor(entry.prefixLength / BITS_PER_BYTE);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (sourceBytes[index] !== entry.bytes[index]) {
      return false;
    }
  }
  const remainingBits = entry.prefixLength % BITS_PER_BYTE;
  if (remainingBits === 0) {
    return true;
  }
  const mask = (0xff << (BITS_PER_BYTE - remainingBits)) & 0xff;
  return ((sourceBytes[wholeBytes] ?? 0) & mask) === ((entry.bytes[wholeBytes] ?? 0) & mask);
}
