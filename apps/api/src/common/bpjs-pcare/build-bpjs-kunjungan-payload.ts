import { BpjsSubmissionReferralData, BpjsSubmissionVitalsData } from '@hms/shared-types';

import {
  BpjsPcareKunjunganPayload,
  BpjsPcareRujukLanjutPayload,
} from './bpjs-pcare-submission.types';
import { formatBpjsPcareDate } from './format-bpjs-pcare-date';

const OUTPATIENT_KD_TKP = '10';
/** Compos mentis — no consciousness level is modelled clinically yet, and an outpatient FKTP visit that completed a normal encounter is compos mentis. */
const DEFAULT_KD_SADAR = '01';
/** Berobat jalan (outpatient discharge, no referral). */
const DISCHARGE_KD_STATUS_PULANG = '3';
/** Rujuk lanjut — set whenever a rujukan rides the kunjungan (P11-T06). */
const REFERRAL_KD_STATUS_PULANG = '4';
const MAX_KELUHAN_LENGTH = 400;

type BuildBpjsKunjunganPayloadOptions = {
  readonly noKartu: string;
  readonly kdPoli: string;
  readonly kdDokter: string;
  readonly registrationDate: Date;
  readonly dischargeDate: Date;
  readonly keluhan: string | null;
  readonly diagnosisCodes: readonly string[];
  readonly vitals: BpjsSubmissionVitalsData | null;
  readonly referral?: BpjsSubmissionReferralData | null;
  readonly terapi?: string | null;
};

/**
 * Builds the kunjungan (encounter) body sent at encounter close. The first
 * diagnosis code must be the PRIMARY one (the caller orders them); PCare
 * takes at most three. Missing vitals are sent as integer zeros, matching
 * the reference implementations' convention for unmeasured values. A
 * recorded referral flips the discharge status to rujuk lanjut and attaches
 * the rujukLanjut block — PCare issues the referral letter from it (ADR
 * D-022: there is no standalone rujukan create endpoint).
 */
export function buildBpjsKunjunganPayload(
  options: BuildBpjsKunjunganPayloadOptions,
): BpjsPcareKunjunganPayload {
  const [kdDiag1, kdDiag2, kdDiag3] = options.diagnosisCodes;
  if (kdDiag1 === undefined) {
    throw new Error('BPJS kunjungan payload requires at least one diagnosis code');
  }
  const rujukLanjut = buildRujukLanjut(options.referral ?? null);
  return {
    noKunjungan: null,
    noKartu: options.noKartu,
    tglDaftar: formatBpjsPcareDate(options.registrationDate),
    kdPoli: options.kdPoli,
    keluhan: truncateKeluhan(options.keluhan),
    kdSadar: DEFAULT_KD_SADAR,
    sistole: toWholeNumber(options.vitals?.systolicBloodPressure),
    diastole: toWholeNumber(options.vitals?.diastolicBloodPressure),
    beratBadan: toWholeNumber(options.vitals?.weightKg),
    tinggiBadan: toWholeNumber(options.vitals?.heightCm),
    respRate: toWholeNumber(options.vitals?.respiratoryRate),
    heartRate: toWholeNumber(options.vitals?.pulseRate),
    lingkarPerut: 0,
    kdStatusPulang:
      rujukLanjut === null ? DISCHARGE_KD_STATUS_PULANG : REFERRAL_KD_STATUS_PULANG,
    tglPulang: formatBpjsPcareDate(options.dischargeDate),
    kdDokter: options.kdDokter,
    kdDiag1,
    kdDiag2: kdDiag2 ?? null,
    kdDiag3: kdDiag3 ?? null,
    kdPostatus: null,
    kdTkp: OUTPATIENT_KD_TKP,
    terapi: options.terapi ?? null,
    rujukLanjut,
  };
}

function buildRujukLanjut(
  referral: BpjsSubmissionReferralData | null,
): BpjsPcareRujukLanjutPayload | null {
  if (referral === null) {
    return null;
  }
  return {
    kdppk: referral.destinationProviderCode,
    tglEstRujuk: formatBpjsPcareDate(referral.estimatedReferralDate),
    subSpesialis:
      referral.subSpecialtyCode === null
        ? null
        : { kdSubSpesialis1: referral.subSpecialtyCode, kdSarana: referral.saranaCode },
    khusus:
      referral.khususCode === null
        ? null
        : {
            kdKhusus: referral.khususCode,
            kdSubSpesialis: referral.subSpecialtyCode,
            catatan: referral.notes,
          },
  };
}

function truncateKeluhan(keluhan: string | null): string | null {
  if (keluhan === null || keluhan.trim().length === 0) {
    return null;
  }
  return keluhan.trim().slice(0, MAX_KELUHAN_LENGTH);
}

function toWholeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value);
}
