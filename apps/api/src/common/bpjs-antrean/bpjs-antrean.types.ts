import {
  BpjsGatewayHttpMethod,
  BpjsGatewayResiliencePolicy,
} from '../bpjs-gateway/bpjs-gateway.types';

/**
 * The credential set BPJS issues for the *Antrean* service. Deliberately
 * three fields, not PCare's five: there is no PCare web-app login behind
 * antrean, so no username/password pair feeds an `X-Authorization` header.
 * That absence is spike question Q8 (docs/post-mvp/bpjs-antrean-spike.md) —
 * confirm it with one authenticated `ref/poli` call before UAT.
 */
export type BpjsAntreanRequestCredentials = {
  readonly consId: string;
  readonly secretKey: string;
  readonly userKey: string;
};

export type BpjsAntreanSignedHeaders = {
  readonly 'X-cons-id': string;
  readonly 'X-Timestamp': string;
  readonly 'X-Signature': string;
  readonly user_key: string;
};

export type BpjsAntreanCodecErrorCode =
  | 'BPJS_ANTREAN_RESPONSE_MALFORMED'
  | 'BPJS_ANTREAN_DECRYPT_FAILED'
  | 'BPJS_ANTREAN_DECOMPRESS_FAILED';

export type BpjsAntreanErrorCode =
  | 'BPJS_ANTREAN_NOT_CONFIGURED'
  | 'BPJS_ANTREAN_UNAUTHORIZED'
  | 'BPJS_ANTREAN_TIMEOUT'
  | 'BPJS_ANTREAN_UNAVAILABLE'
  | 'BPJS_ANTREAN_CIRCUIT_OPEN'
  | 'BPJS_ANTREAN_REQUEST_REJECTED'
  | BpjsAntreanCodecErrorCode;

export type BpjsAntreanAdapterConfig = BpjsGatewayResiliencePolicy & {
  readonly developmentBaseUrl: string;
  readonly productionBaseUrl: string;
};

/**
 * One resolved facility connection: which Antrean environment to call and the
 * decrypted credential set to sign with. Assembled by the feature repository
 * (the only layer allowed to decrypt) and handed to the HTTP client per call,
 * because BPJS credentials live in the database, not the environment.
 */
export type BpjsAntreanConnection = {
  readonly environment: 'DEVELOPMENT' | 'PRODUCTION';
  readonly credentials: BpjsAntreanRequestCredentials;
};

/**
 * Key material for the *inbound* token scheme (P14-T04). Stays in this
 * API-internal types file for the same reason {@link BpjsAntreanConnection}
 * does: it is derived from a stored credential and must never be modelled in
 * `@hms/shared-types`, where the web app could import it.
 *
 * Both fields are derived from the stored bcrypt hash of BPJS's inbound
 * password, never from the password itself, and the hash is not recoverable
 * from either. Deriving them this way is what makes a password rotation
 * invalidate every outstanding token with no revocation list to maintain:
 * a new hash produces a new signing key *and* a new fingerprint, so tokens
 * signed under the old one fail both checks.
 */
export type BpjsAntreanInboundTokenMaterial = {
  readonly signingKey: Buffer;
  readonly credentialFingerprint: string;
};

export type BpjsAntreanRequest = {
  readonly method: BpjsGatewayHttpMethod;
  readonly path: string;
  readonly body?: unknown;
};
