import { formatBpjsPcareDate } from './format-bpjs-pcare-date';

type BuildBpjsPendaftaranDeletePathOptions = {
  readonly noKartu: string;
  readonly registrationDate: Date;
  readonly noUrut: string;
  readonly kdPoli: string;
};

/**
 * Builds the DELETE path that revokes an already-submitted pendaftaran when
 * the HMS-side registration is cancelled (ADR D-022 endpoint map). The
 * kdPoli must be the code the pendaftaran actually went out with — the
 * caller passes the stored `submittedKdPoli`, not a fresh mapping lookup.
 */
export function buildBpjsPendaftaranDeletePath(
  options: BuildBpjsPendaftaranDeletePathOptions,
): string {
  const tglDaftar = formatBpjsPcareDate(options.registrationDate);
  return `pendaftaran/peserta/${options.noKartu}/tglDaftar/${tglDaftar}/noUrut/${encodeURIComponent(options.noUrut)}/kdPoli/${options.kdPoli}`;
}
