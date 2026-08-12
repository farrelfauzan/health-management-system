import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditController } from './controller/audit.controller';
import { AuditQueryRepository } from './repository/audit-query.repository';
import { AuditQueryService } from './service/audit-query.service';

/**
 * The read side of the audit log (SJ-4). Named apart from the global
 * `AuditModule` in `common/audit`, which owns the write path: one module
 * appends, one answers questions, and nothing does both.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditQueryRepository, AuditQueryService],
})
export class AuditQueryModule {}
