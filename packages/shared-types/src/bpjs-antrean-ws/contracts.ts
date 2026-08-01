/**
 * Response payloads for the inbound Antrean Online web services (P14-T04).
 *
 * These are the one place in the HMS API where the response convention is
 * **BPJS's**, not HMS's `{ data }` envelope: BPJS's client is written against
 * `metaData.code` / `metaData.message` and will not read anything else. The
 * envelope lives here rather than in a controller helper so the shape is a
 * declared contract that a test can assert against.
 *
 * Field names and the `metaData` casing are spike question Q5 — unconfirmed
 * against a live caller. See `docs/post-mvp/bpjs-antrean-spike.md`.
 */

export type AntreanEnvelopeMetaData = {
  code: number;
  message: string;
};

/**
 * `response` is null on every failure and on services that answer with no
 * body (batal antrean). It is never omitted: BPJS's reference clients read
 * the key unconditionally.
 */
export type AntreanEnvelope<TResponse> = {
  metaData: AntreanEnvelopeMetaData;
  response: TResponse | null;
};

export type AntreanTokenResponse = {
  token: string;
};

export type AntreanStatusResponse = {
  namapoli: string;
  namadokter: string;
  totalantrean: number;
  sisaantrean: number;
  antreanpanggil: string;
  keterangan: string;
};

export type AntreanTakeResponse = {
  nomorantrean: string;
  angkaantrean: number;
  kodebooking: string;
  norm: string;
  namapoli: string;
  namadokter: string;
  estimasidilayani: number;
  sisakuotajkn: number | null;
  kuotajkn: number | null;
  keterangan: string;
};

export type AntreanRemainingResponse = {
  nomorantrean: string;
  namapoli: string;
  namadokter: string;
  sisaantrean: number;
  antreanpanggil: string;
  waktutunggu: number;
  keterangan: string;
};

export type AntreanNewPatientResponse = {
  norm: string;
  nama: string;
  keterangan: string;
};
