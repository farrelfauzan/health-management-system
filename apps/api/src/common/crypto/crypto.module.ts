import { Global, Module } from '@nestjs/common';

import { NationalIdentifierCryptoService } from './national-identifier-crypto.service';

/**
 * Registers identifier encryption for the whole application. Repositories are
 * the only layer allowed to inject {@link NationalIdentifierCryptoService}:
 * ciphertext and blind-index columns must never reach a service, DTO or
 * contract.
 */
@Global()
@Module({
  providers: [NationalIdentifierCryptoService],
  exports: [NationalIdentifierCryptoService],
})
export class CryptoModule {}
