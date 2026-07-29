import { Global, Module } from '@nestjs/common';

import { BpjsCredentialCryptoService } from './bpjs-credential-crypto.service';
import { NationalIdentifierCryptoService } from './national-identifier-crypto.service';

/**
 * Registers identifier and credential encryption for the whole application.
 * Repositories are the only layer allowed to inject
 * {@link NationalIdentifierCryptoService} or
 * {@link BpjsCredentialCryptoService}: ciphertext and blind-index columns
 * must never reach a service, DTO or contract.
 */
@Global()
@Module({
  providers: [NationalIdentifierCryptoService, BpjsCredentialCryptoService],
  exports: [NationalIdentifierCryptoService, BpjsCredentialCryptoService],
})
export class CryptoModule {}
