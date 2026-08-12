import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [
    AuditService,
    AuditRepository,
    AuditContextService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, AuditContextService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditContextMiddleware).forRoutes('{*splat}');
  }
}
