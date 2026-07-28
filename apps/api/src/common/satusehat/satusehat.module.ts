import { Module } from '@nestjs/common';

import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatTokenClient } from './satusehat-token.client';

/**
 * SATUSEHAT platform adapter foundation (P10-T01): OAuth2 token client plus
 * the resilient authenticated HTTP client. Feature modules inject
 * {@link SatusehatHttpClient} only — FHIR resource types and mappers arrive in
 * later Phase 10 tasks and must never leak into domain services.
 */
@Module({
  providers: [SatusehatTokenClient, SatusehatHttpClient],
  exports: [SatusehatHttpClient],
})
export class SatusehatModule {}
