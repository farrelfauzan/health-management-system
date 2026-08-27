import { Injectable, Logger } from '@nestjs/common';

import { MailService } from './mail.service';
import { SendMailRequest, SendMailResult } from './mail.types';

/**
 * The development transport: writes the message to the application log
 * instead of sending it.
 *
 * It logs the **plain-text body in full**, deliberately. That body carries the
 * invitation link, and a developer with no SMTP account still has to be able
 * to walk the accept flow — a transport that swallowed the one thing the email
 * exists to deliver would just be a silent failure with extra steps. It is
 * selected only when no `MAIL_HOST` is configured, so it can never be what a
 * deployment that means to send mail ends up running.
 */
@Injectable()
export class LogMailService extends MailService {
  private readonly logger = new Logger(LogMailService.name);

  async sendMail(request: SendMailRequest): Promise<SendMailResult> {
    this.logger.log(
      `[mail:log-transport] to=${request.to} subject=${request.subject}\n${request.text}`,
    );
    return { accepted: true, messageId: undefined };
  }
}
