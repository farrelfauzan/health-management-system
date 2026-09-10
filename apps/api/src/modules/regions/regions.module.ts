import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RegionsController } from './controller/regions.controller';
import { RegionsRepository } from './repository/regions.repository';
import { RegionsService } from './service/regions.service';

/**
 * Exports the service, not the repository: the patient service validates an
 * address chain through `RegionsService.assertAddressChain`, and a module
 * reaching into another module's repository is the boundary `CLAUDE.md`
 * forbids.
 */
@Module({
  imports: [AuthModule],
  controllers: [RegionsController],
  providers: [RegionsRepository, RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}
