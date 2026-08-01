import { Module } from '@nestjs/common';

import { BpjsAntreanHttpClient } from './bpjs-antrean-http.client';
import { BpjsAntreanInboundConfig } from './bpjs-antrean-inbound.config';

/**
 * Common infrastructure adapter for the BPJS Antrean Online gateway
 * (P14-T03). Feature modules inject {@link BpjsAntreanHttpClient} only — wire
 * formats, signing, and the response codec never leave this directory.
 * Separate from {@link BpjsPcareModule} because the two services carry
 * separately issued, separately revoked credentials (ADR D-023).
 *
 * {@link BpjsAntreanInboundConfig} lives here rather than inside the inbound
 * module (P14-T04) because both directions read it: the inbound guards use it
 * to decide whether the public surface exists at all, and the admin
 * configuration surface reads it to tell an operator why that surface is still
 * dark. Putting it in either feature module would have made the two import
 * each other.
 */
@Module({
  providers: [BpjsAntreanHttpClient, BpjsAntreanInboundConfig],
  exports: [BpjsAntreanHttpClient, BpjsAntreanInboundConfig],
})
export class BpjsAntreanModule {}
