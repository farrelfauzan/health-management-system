import { isIP } from 'node:net';

/**
 * One entry of the configured source-IP allowlist, pre-parsed into the form
 * the match runs against. Bare addresses become full-width prefixes so a
 * single code path handles `10.1.2.3` and `10.1.0.0/16`.
 */
export type IpAllowlistEntry = {
  readonly bytes: Uint8Array;
  readonly prefixLength: number;
};

const IPV4_BIT_LENGTH = 32;
const IPV6_BIT_LENGTH = 128;
const IPV4_MAPPED_PREFIX = '::ffff:';
const BITS_PER_BYTE = 8;

/**
 * Normalises an address to its byte form, folding IPv4-mapped IPv6
 * (`::ffff:10.0.0.1`) down to plain IPv4. Node hands the mapped form back for
 * an IPv4 client on a dual-stack listener, so without this fold an operator
 * who allowlists `10.0.0.0/8` would silently allow nobody.
 */
export function toAddressBytes(address: string): Uint8Array | null {
  const trimmed = address.trim().toLowerCase();
  const unmapped = trimmed.startsWith(IPV4_MAPPED_PREFIX)
    ? trimmed.slice(IPV4_MAPPED_PREFIX.length)
    : trimmed;
  const version = isIP(unmapped);
  if (version === 4) {
    return parseIpv4Bytes(unmapped);
  }
  if (version === 6) {
    return parseIpv6Bytes(unmapped);
  }
  return null;
}

function parseIpv4Bytes(address: string): Uint8Array | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const bytes = new Uint8Array(4);
  for (let index = 0; index < 4; index += 1) {
    const value = Number(parts[index]);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    bytes[index] = value;
  }
  return bytes;
}

function parseIpv6Bytes(address: string): Uint8Array | null {
  const [head = '', tail = ''] = address.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === '' ? [] : tail.split(':');
  const hasElision = address.includes('::');
  const filler = 8 - headGroups.length - tailGroups.length;
  if (!hasElision && headGroups.length !== 8) {
    return null;
  }
  if (hasElision && filler < 0) {
    return null;
  }
  const groups = hasElision
    ? [...headGroups, ...Array<string>(filler).fill('0'), ...tailGroups]
    : headGroups;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 8; index += 1) {
    const value = Number.parseInt(groups[index] ?? '', 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      return null;
    }
    bytes[index * 2] = value >> BITS_PER_BYTE;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

/**
 * Parses one allowlist entry (`203.0.113.7` or `203.0.113.0/24`). Returns null
 * for anything unparseable — the caller turns that into a startup failure
 * rather than dropping the entry, because an allowlist that silently loses a
 * range fails *open* against the operator's intent.
 */
export function parseIpAllowlistEntry(entry: string): IpAllowlistEntry | null {
  const [addressPart = '', prefixPart] = entry.trim().split('/');
  const bytes = toAddressBytes(addressPart);
  if (bytes === null) {
    return null;
  }
  const maxPrefix = bytes.length === 4 ? IPV4_BIT_LENGTH : IPV6_BIT_LENGTH;
  if (prefixPart === undefined) {
    return { bytes, prefixLength: maxPrefix };
  }
  const prefixLength = Number(prefixPart);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > maxPrefix) {
    return null;
  }
  return { bytes, prefixLength };
}
