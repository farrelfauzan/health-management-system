/**
 * Internal types for the inbound Antrean Online surface (P14-T04). Shared with
 * the web app only so an operator-facing readiness panel can render the same
 * vocabulary the API uses; nothing here crosses the BPJS wire.
 */

/**
 * Why an inbound call was refused before it reached a domain service. Ordered
 * the way the guards run: allowlist first, then token, then quota. The
 * ordering is a security property, not a formality — the token check must
 * never run for a caller that is not BPJS, so a stolen token cannot be probed
 * from an arbitrary host.
 */
export type BpjsAntreanInboundRejectionReason =
  | 'SURFACE_DISABLED'
  | 'SOURCE_IP_NOT_ALLOWED'
  | 'CREDENTIALS_NOT_CONFIGURED'
  | 'INVALID_CREDENTIALS'
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'RATE_LIMITED';

/**
 * Claims carried by an issued inbound token. Deliberately **no HMS identity**:
 * the token proves that the caller presented the agreed BPJS credential pair,
 * and nothing else. Authorisation comes from the reserved system actor the
 * module resolves server-side, so a leaked token can never be widened into an
 * HMS session.
 */
export type BpjsAntreanInboundTokenClaims = {
  /** Fixed audience marker, so a token from another HMS surface cannot be replayed here. */
  aud: 'bpjs-antrean-inbound';
  /** Issued-at and expiry, epoch seconds. */
  iat: number;
  exp: number;
  /**
   * Binds the token to the credential generation that issued it. Derived from
   * the stored inbound password hash, so rotating the password invalidates
   * every outstanding token without a revocation list.
   */
  cred: string;
};

/**
 * Operator-facing readiness of the inbound surface. Every field is a
 * precondition that must hold before BPJS can call the facility at all; the
 * surface stays dark while any of them is false.
 */
export type BpjsAntreanInboundReadiness = {
  isEnabled: boolean;
  hasSourceIpAllowlist: boolean;
  allowedSourceRangeCount: number;
  hasInboundCredentials: boolean;
  tokenLifetimeSeconds: number;
  trustedProxyHopCount: number;
};

/** One inbound service, as named on the BPJS UAT checklist. */
export type BpjsAntreanInboundService =
  | 'TOKEN'
  | 'STATUS_ANTREAN'
  | 'AMBIL_ANTREAN'
  | 'SISA_ANTREAN'
  | 'PASIEN_BARU'
  | 'BATAL_ANTREAN';
