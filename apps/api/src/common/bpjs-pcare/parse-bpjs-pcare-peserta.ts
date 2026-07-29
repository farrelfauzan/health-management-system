import { BpjsPcareError } from './bpjs-pcare.error';
import { BpjsPcarePesertaSummary } from './bpjs-pcare-peserta.types';

/**
 * Normalises a decoded PCare peserta payload. Returns null for a "no data"
 * outcome (null response or empty list) so the caller can settle NOT_FOUND.
 * The member object is unwrapped from the shapes the reference
 * implementations disagree on (bare object, `{ peserta }`, `{ list: [...] }`),
 * and a member object carrying no activity signal at all (`aktif` or
 * `ketAktif`) is protocol drift that fails loudly as RESPONSE_MALFORMED —
 * an eligibility card must never guess a member's status.
 */
export function parseBpjsPcarePeserta(response: unknown): BpjsPcarePesertaSummary | null {
  const member = unwrapMemberObject(response);
  if (member === null) {
    return null;
  }
  const isActive = readActivitySignal(member);
  if (isActive === null) {
    throw new BpjsPcareError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'BPJS PCare peserta payload carries no aktif/ketAktif status signal',
    );
  }
  return {
    name: readString(member.nama),
    isActive,
    statusReason: readString(member.ketAktif),
    memberTypeName: readNestedName(member.jnsPeserta),
    memberClassName: readNestedName(member.jnsKelas),
    providerCode: readNestedString(member.kdProviderPst, 'kdProvider'),
    providerName: readNestedString(member.kdProviderPst, 'nmProvider'),
    isProlanis: readFlag(member.pstProl),
    isPrb: readFlag(member.pstPrb),
  };
}

function unwrapMemberObject(response: unknown): Record<string, unknown> | null {
  if (response === null || response === undefined) {
    return null;
  }
  if (Array.isArray(response)) {
    return response.length === 0 ? null : asMemberObject(response[0]);
  }
  if (typeof response !== 'object') {
    throw new BpjsPcareError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'BPJS PCare peserta payload is not an object',
    );
  }
  const candidate = response as Record<string, unknown>;
  if (Array.isArray(candidate.list)) {
    return candidate.list.length === 0 ? null : asMemberObject(candidate.list[0]);
  }
  if (typeof candidate.peserta === 'object' && candidate.peserta !== null) {
    return candidate.peserta as Record<string, unknown>;
  }
  return candidate;
}

function asMemberObject(entry: unknown): Record<string, unknown> {
  if (typeof entry !== 'object' || entry === null) {
    throw new BpjsPcareError(
      'BPJS_PCARE_RESPONSE_MALFORMED',
      'BPJS PCare peserta list entry is not an object',
    );
  }
  return entry as Record<string, unknown>;
}

function readActivitySignal(member: Record<string, unknown>): boolean | null {
  if (typeof member.aktif === 'boolean') {
    return member.aktif;
  }
  if (typeof member.aktif === 'string') {
    return member.aktif.trim().toLowerCase() === 'true';
  }
  const statusText = readString(member.ketAktif);
  if (statusText !== null) {
    return statusText.toUpperCase() === 'AKTIF';
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function readNestedName(value: unknown): string | null {
  return readNestedString(value, 'nama');
}

function readNestedString(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return readString((value as Record<string, unknown>)[fieldName]);
}

function readFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const text = readString(value);
  if (text === null) {
    return false;
  }
  const normalised = text.toLowerCase();
  return normalised !== '0' && normalised !== 'false' && normalised !== 'null';
}
