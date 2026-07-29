import { BpjsPcarePendaftaranPayload } from './bpjs-pcare-submission.types';
import { formatBpjsPcareDate } from './format-bpjs-pcare-date';

const OUTPATIENT_KD_TKP = '10';

type BuildBpjsPendaftaranPayloadOptions = {
  readonly kdProviderPeserta: string;
  readonly noKartu: string;
  readonly kdPoli: string;
  readonly registrationDate: Date;
  readonly keluhan?: string | null;
};

/**
 * Builds the pendaftaran (visit registration) body sent at check-in. Vitals
 * are zeroed deliberately: they are recorded during the encounter, after
 * check-in, and PCare accepts the update on the kunjungan — the reference
 * implementations send integer zeros for unmeasured values. kdTkp is pinned
 * to '10' (rawat jalan): this system registers outpatient FKTP visits only.
 */
export function buildBpjsPendaftaranPayload(
  options: BuildBpjsPendaftaranPayloadOptions,
): BpjsPcarePendaftaranPayload {
  return {
    kdProviderPeserta: options.kdProviderPeserta,
    tglDaftar: formatBpjsPcareDate(options.registrationDate),
    noKartu: options.noKartu,
    kdPoli: options.kdPoli,
    keluhan: options.keluhan ?? null,
    kunjSakit: true,
    sistole: 0,
    diastole: 0,
    beratBadan: 0,
    tinggiBadan: 0,
    respRate: 0,
    heartRate: 0,
    lingkarPerut: 0,
    kdTkp: OUTPATIENT_KD_TKP,
  };
}
