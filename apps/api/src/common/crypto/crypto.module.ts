import { Global, Module } from '@nestjs/common';

import { AiProviderCryptoService } from './ai-provider-crypto.service';
import { BreachedPasswordCheckerService } from './breached-password-checker.service';
import { BpjsCredentialCryptoService } from './bpjs-credential-crypto.service';
import { NationalIdentifierCryptoService } from './national-identifier-crypto.service';
import { PasswordHasherService } from './password-hasher.service';

/**
 * Registers identifier and credential encryption for the whole application.
 * Repositories are the only layer allowed to inject
 * {@link NationalIdentifierCryptoService}, {@link BpjsCredentialCryptoService}
 * or {@link AiProviderCryptoService}: ciphertext and blind-index columns
 * must never reach a service, DTO or contract.
 *
 * {@link PasswordHasherService} is the exception to that rule: password hashes
 * are not an encryption concern and services legitimately need to set one
 * (SJ-7).
 */
@Global()
@Module({
  providers: [
    NationalIdentifierCryptoService,
    BpjsCredentialCryptoService,
    AiProviderCryptoService,
    PasswordHasherService,
    BreachedPasswordCheckerService,
  ],
  exports: [
    NationalIdentifierCryptoService,
    BpjsCredentialCryptoService,
    AiProviderCryptoService,
    PasswordHasherService,
    BreachedPasswordCheckerService,
  ],
})
export class CryptoModule {}
