import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationUnitController } from './controller/organization-unit.controller';
import { OrganizationUnitRepository } from './repository/organization-unit.repository';
import { OrganizationUnitMapper } from './service/organization-unit.mapper';
import { OrganizationUnitService } from './service/organization-unit.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationUnitController],
  providers: [OrganizationUnitRepository, OrganizationUnitMapper, OrganizationUnitService],
})
export class OrganizationStructureModule {}
