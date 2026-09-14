import { Module } from '@nestjs/common';

import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatKfaClient } from './satusehat-kfa.client';
import { SatusehatLocationClient } from './satusehat-location.client';
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
    SatusehatKfaClient,
    SatusehatLocationClient,
    SatusehatMasterDataClient,
    SatusehatFhirMapper,
  ],
  exports: [
    SatusehatHttpClient,
    SatusehatKfaClient,
    SatusehatLocationClient,
    SatusehatMasterDataClient,
    SatusehatFhirMapper,
  ],
})
export class SatusehatModule {}
