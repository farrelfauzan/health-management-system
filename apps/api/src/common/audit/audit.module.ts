import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditContextMiddleware } from './audit-context.middleware';
import { AuditContextService } from './audit-context.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { NoStoreInterceptor } from './no-store.interceptor';

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
    // SJ-9. Registered here rather than beside the session code because it
    // keys off `@Audited()`, and keeping the reader next to the annotation is
    // what stops the two drifting apart.
    {
      provide: APP_INTERCEPTOR,
      useClass: NoStoreInterceptor,
    },
  ],
  exports: [AuditService, AuditContextService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditContextMiddleware).forRoutes('{*splat}');
  }
}
