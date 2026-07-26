import { Global, Module } from '@nestjs/common';

import { PatientIdentifierCryptoService } from './patient-identifier-crypto.service';

/**
 * Registers identifier encryption for the whole application. Repositories are
 * the only layer allowed to inject {@link PatientIdentifierCryptoService}:
 * ciphertext and blind-index columns must never reach a service, DTO or
 * contract.
 */
@Global()
@Module({
  providers: [PatientIdentifierCryptoService],
  exports: [PatientIdentifierCryptoService],
})
export class CryptoModule {}
