import { Global, Module } from '@nestjs/common';

import { AiProviderCryptoService } from './ai-provider-crypto.service';
import { BpjsCredentialCryptoService } from './bpjs-credential-crypto.service';
import { NationalIdentifierCryptoService } from './national-identifier-crypto.service';

/**
 * Registers identifier and credential encryption for the whole application.
 * Repositories are the only layer allowed to inject
 * {@link NationalIdentifierCryptoService}, {@link BpjsCredentialCryptoService}
 * or {@link AiProviderCryptoService}: ciphertext and blind-index columns
 * must never reach a service, DTO or contract.
 */
@Global()
@Module({
  providers: [NationalIdentifierCryptoService, BpjsCredentialCryptoService, AiProviderCryptoService],
  exports: [NationalIdentifierCryptoService, BpjsCredentialCryptoService, AiProviderCryptoService],
})
export class CryptoModule {}
