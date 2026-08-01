import { SourceAddressRequest } from '../service/resolve-request-source-ip';

/**
 * The request as the inbound guards and controller see it. `bpjsAntreanSourceIp`
 * is stamped by the source-IP guard and read by everything after it, so the
 * address that the allowlist decision was made against is the same one the
 * audit trail records — resolving it twice would let a trusted-proxy header
 * change between the check and the log.
 */
export type BpjsAntreanInboundRequest = SourceAddressRequest & {
  bpjsAntreanSourceIp?: string | null;
};
