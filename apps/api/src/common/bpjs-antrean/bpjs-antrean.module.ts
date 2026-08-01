import { Module } from '@nestjs/common';

import { BpjsAntreanHttpClient } from './bpjs-antrean-http.client';

/**
 * Common infrastructure adapter for the BPJS Antrean Online gateway
 * (P14-T03). Feature modules inject {@link BpjsAntreanHttpClient} only — wire
 * formats, signing, and the response codec never leave this directory.
 * Separate from {@link BpjsPcareModule} because the two services carry
 * separately issued, separately revoked credentials (ADR D-023).
 */
@Module({
  providers: [BpjsAntreanHttpClient],
  exports: [BpjsAntreanHttpClient],
})
export class BpjsAntreanModule {}
