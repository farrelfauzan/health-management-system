import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LogMailService } from './log-mail.service';
import { resolveMailConfig } from './mail.config';
import { MailService } from './mail.service';
import { SmtpMailService } from './smtp-mail.service';

/**
 * Binds {@link MailService} to a transport chosen at boot from `MAIL_*`.
 *
 * Global, like `PrismaModule`: outbound mail is infrastructure every feature
 * may eventually want, and the alternative is re-importing it in each module
 * that ever sends a message.
 */
@Global()
@Module({
  providers: [
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): MailService =>
        resolveMailConfig(configService).transport === 'smtp'
          ? new SmtpMailService(configService)
          : new LogMailService(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
