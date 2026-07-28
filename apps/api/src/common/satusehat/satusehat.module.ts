import { Module } from '@nestjs/common';

import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatMasterDataClient } from './satusehat-master-data.client';
import { SatusehatTokenClient } from './satusehat-token.client';

/**
 * SATUSEHAT platform adapter (P10-T01..T03): OAuth2 token client, the
 * resilient authenticated HTTP client, master-data lookups, and the FHIR
 * mappers. Feature modules inject the clients and the mapper — FHIR resource
 * shapes must never leak into domain services.
 */
@Module({
  providers: [
    SatusehatTokenClient,
    SatusehatHttpClient,
    SatusehatMasterDataClient,
    SatusehatFhirMapper,
  ],
  exports: [SatusehatHttpClient, SatusehatMasterDataClient, SatusehatFhirMapper],
})
export class SatusehatModule {}
