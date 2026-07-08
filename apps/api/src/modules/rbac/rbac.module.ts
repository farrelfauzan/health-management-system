import { Module } from '@nestjs/common';

import { RbacController } from './controller/rbac.controller';
import { RbacRepository } from './repository/rbac.repository';
import { RbacService } from './service/rbac.service';
import { PrismaModule } from '@/common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RbacController],
  providers: [RbacRepository, RbacService],
})
export class RbacModule {}
