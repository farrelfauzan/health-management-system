import { Module } from '@nestjs/common';

import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatMasterDataClient } from './satusehat-master-data.client';
import { SatusehatTokenClient } from './satusehat-token.client';

/**
 * SATUSEHAT platform adapter (P10-T01/T02): OAuth2 token client, the
 * resilient authenticated HTTP client, and master-data lookups. Feature
 * modules inject {@link SatusehatMasterDataClient} (or the HTTP client for
 * later Phase 10 tasks) — FHIR resource shapes must never leak into domain
 * services.
 */
@Module({
  providers: [SatusehatTokenClient, SatusehatHttpClient, SatusehatMasterDataClient],
  exports: [SatusehatHttpClient, SatusehatMasterDataClient],
})
export class SatusehatModule {}
