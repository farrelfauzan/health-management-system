import { createHmac } from 'node:crypto';

import { BpjsPcareRequestCredentials, BpjsPcareSignedHeaders } from './bpjs-pcare.types';

const BPJS_PCARE_APPLICATION_CODE: string = '095';

/**
 * Builds the five signed request headers PCare REST v3.0 expects on every
 * call. The caller must keep the `timestampSeconds` it passed here, because
 * the response AES key is derived from the same timestamp
 * ({@link decodeBpjsPcareResponse}). Protocol confirmed against the community
 * reference implementations recorded in the P11-T01 ADR
 * (docs/post-mvp/decisions.md).
 */
export function buildBpjsPcareHeaders(params: {
  readonly credentials: BpjsPcareRequestCredentials;
  readonly timestampSeconds: number;
}): BpjsPcareSignedHeaders {
  const { credentials, timestampSeconds } = params;
  const timestamp: string = String(timestampSeconds);
  const signature: string = createHmac('sha256', credentials.secretKey)
    .update(`${credentials.consId}&${timestamp}`)
    .digest('base64');
  const basicAuthorizationToken: string = Buffer.from(
    `${credentials.pcareUsername}:${credentials.pcarePassword}:${BPJS_PCARE_APPLICATION_CODE}`,
    'utf8',
  ).toString('base64');
  return {
    'X-cons-id': credentials.consId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'X-Authorization': `Basic ${basicAuthorizationToken}`,
    user_key: credentials.userKey,
  };
}
