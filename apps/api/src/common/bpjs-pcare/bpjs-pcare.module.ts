import { Module } from '@nestjs/common';

import { BpjsPcareHttpClient } from './bpjs-pcare-http.client';

/**
 * Common infrastructure adapter for the BPJS PCare gateway (P11-T02).
 * Feature modules inject {@link BpjsPcareHttpClient} only — wire formats,
 * signing, and the response codec never leave this directory.
 */
@Module({
  providers: [BpjsPcareHttpClient],
  exports: [BpjsPcareHttpClient],
})
export class BpjsPcareModule {}
