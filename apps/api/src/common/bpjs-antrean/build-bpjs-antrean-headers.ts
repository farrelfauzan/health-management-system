import { createHmac } from 'node:crypto';

import { BpjsAntreanRequestCredentials, BpjsAntreanSignedHeaders } from './bpjs-antrean.types';

/**
 * Builds the four signed request headers the BPJS Antrean service expects on
 * every outbound call. The HMAC construction is D-022's, unchanged —
 * `Base64(HMAC-SHA256("{consId}&{timestamp}", secretKey))` — and the caller
 * must keep the `timestampSeconds` it passed here, because the response AES
 * key is derived from the same timestamp.
 *
 * What differs from {@link buildBpjsPcareHeaders} is the absence of
 * `X-Authorization`: that header carries a PCare web-app login and the fixed
 * `kdAplikasi` `095`, and the Antrean service has no equivalent login. That
 * absence is the whole delta between the two header sets, and it is spike
 * question Q8 (docs/post-mvp/bpjs-antrean-spike.md) — a hypothesis with no
 * live confirmation behind it, cheap to settle with one `ref/poli` call.
 */
export function buildBpjsAntreanHeaders(params: {
  readonly credentials: BpjsAntreanRequestCredentials;
  readonly timestampSeconds: number;
}): BpjsAntreanSignedHeaders {
  const { credentials, timestampSeconds } = params;
  const timestamp: string = String(timestampSeconds);
  const signature: string = createHmac('sha256', credentials.secretKey)
    .update(`${credentials.consId}&${timestamp}`)
    .digest('base64');
  return {
    'X-cons-id': credentials.consId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    user_key: credentials.userKey,
  };
}
