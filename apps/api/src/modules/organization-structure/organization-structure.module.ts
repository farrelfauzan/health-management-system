import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OrganizationUnitMemberController } from './controller/organization-unit-member.controller';
import { OrganizationUnitController } from './controller/organization-unit.controller';
import { OrganizationUnitMemberRepository } from './repository/organization-unit-member.repository';
import { OrganizationUnitRepository } from './repository/organization-unit.repository';
import { OrganizationUnitMemberService } from './service/organization-unit-member.service';
import { OrganizationUnitMapper } from './service/organization-unit.mapper';
import { OrganizationUnitService } from './service/organization-unit.service';

@Module({
  imports: [AuthModule],
  // The member controller is registered after the unit controller so the
  // generated OpenAPI document keeps structure and membership in that order.
  controllers: [OrganizationUnitController, OrganizationUnitMemberController],
  providers: [
    OrganizationUnitRepository,
    OrganizationUnitMemberRepository,
    OrganizationUnitMapper,
    OrganizationUnitService,
    OrganizationUnitMemberService,
  ],
})
export class OrganizationStructureModule {}
