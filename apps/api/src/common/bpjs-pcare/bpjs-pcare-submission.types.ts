/**
 * Wire-level request bodies for the PCare submission flows (P11-T05). Field
 * names and shapes follow the community reference implementations pinned in
 * ADR D-022; like the rest of the protocol they are confirmed against two
 * agreeing PHP ports, with field-level confirmation against the live dev
 * environment deferred until facility credentials exist. These stay in the
 * adapter layer — the feature module hands over normalised clinical data and
 * never sees PCare's field names.
 */
export type BpjsPcarePendaftaranPayload = {
  readonly kdProviderPeserta: string;
  readonly tglDaftar: string;
  readonly noKartu: string;
  readonly kdPoli: string;
  readonly keluhan: string | null;
  readonly kunjSakit: boolean;
  readonly sistole: number;
  readonly diastole: number;
  readonly beratBadan: number;
  readonly tinggiBadan: number;
  readonly respRate: number;
  readonly heartRate: number;
  readonly lingkarPerut: number;
  readonly kdTkp: string;
};

export type BpjsPcareKunjunganPayload = {
  readonly noKunjungan: null;
  readonly noKartu: string;
  readonly tglDaftar: string;
  readonly kdPoli: string;
  readonly keluhan: string | null;
  readonly kdSadar: string;
  readonly sistole: number;
  readonly diastole: number;
  readonly beratBadan: number;
  readonly tinggiBadan: number;
  readonly respRate: number;
  readonly heartRate: number;
  readonly lingkarPerut: number;
  readonly kdStatusPulang: string;
  readonly tglPulang: string;
  readonly kdDokter: string;
  readonly kdDiag1: string;
  readonly kdDiag2: string | null;
  readonly kdDiag3: string | null;
  readonly kdPostatus: null;
  readonly kdTkp: string;
  readonly terapi: string | null;
};
