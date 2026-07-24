import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SpecialtyController } from './controller/specialty.controller';
import { SpecialtyRepository } from './repository/specialty.repository';
import { SpecialtyService } from './service/specialty.service';

@Module({
  imports: [AuthModule],
  controllers: [SpecialtyController],
  providers: [SpecialtyRepository, SpecialtyService],
})
export class SpecialtyModule {}
