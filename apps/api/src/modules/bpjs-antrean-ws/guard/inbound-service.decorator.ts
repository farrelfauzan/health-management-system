import { SetMetadata } from '@nestjs/common';

import { BpjsAntreanInboundService } from '@hms/shared-types';

export const BPJS_ANTREAN_INBOUND_SERVICE_KEY = 'bpjs_antrean_inbound_service';

/**
 * Rate-limit budget class for one inbound endpoint. Three classes rather than
 * a number per route, because the budgets that matter are categorical: reads
 * are cheap and BPJS polls them, writes touch clinical master data, and token
 * issuance is where a credential-guessing attempt would land.
 */
export type BpjsAntreanInboundRateClass = 'TOKEN' | 'READ' | 'WRITE';

export type BpjsAntreanInboundServiceMetadata = {
  readonly service: BpjsAntreanInboundService;
  readonly rateClass: BpjsAntreanInboundRateClass;
};

/**
 * Declares which BPJS service a handler implements and how hard it may be
 * called. The guards read it, and so does the audit trail — an endpoint that
 * forgets this decorator has no metadata to fall back on, which the guards
 * treat as a refusal rather than as an unlimited default.
 */
export function InboundService(metadata: BpjsAntreanInboundServiceMetadata) {
  return SetMetadata(BPJS_ANTREAN_INBOUND_SERVICE_KEY, metadata);
}
