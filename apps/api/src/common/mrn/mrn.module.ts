import { Global, Module } from '@nestjs/common';

import { MrnAllocatorRepository } from './mrn-allocator.repository';

/**
 * Registers medical record number allocation application-wide. Like
 * {@link CryptoModule}, only repositories may inject the allocator: it issues
 * raw SQL against the counter table and must run inside a caller's transaction.
 */
@Global()
@Module({
  providers: [MrnAllocatorRepository],
  exports: [MrnAllocatorRepository],
})
export class MrnModule {}
