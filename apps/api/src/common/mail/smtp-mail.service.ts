import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { buildSafeErrorLog } from '../observability/safe-logging';
import { resolveMailConfig } from './mail.config';
import { MailService } from './mail.service';
import { MailConfig, SendMailRequest, SendMailResult } from './mail.types';

/**
 * SMTP transport over nodemailer. Provider-neutral on purpose: the same six
 * `MAIL_*` variables point it at Brevo, Postmark, Mailtrap, SES's SMTP
 * endpoint, or a Gmail app password, so choosing a vendor is a deployment
 * decision rather than a code change.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly config: MailConfig;
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    super();
    this.config = resolveMailConfig(this.configService);
    this.transporter = createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth
        ? { user: this.config.auth.user, pass: this.config.auth.password }
        : undefined,
      connectionTimeout: this.config.connectionTimeoutMs,
      greetingTimeout: this.config.connectionTimeoutMs,
    });
  }

  /**
   * Resolves `accepted: false` rather than throwing when the provider refuses
   * or the connection dies. Callers send mail *after* committing the row it
   * announces, so a raised exception there would roll back a completed
   * invitation to report that the notification about it failed — the caller
   * decides what a failed send means, and it is never "undo the work".
   *
   * The recipient address is not logged on failure: a bounce log is a list of
   * addresses the clinic tried to reach, and `buildSafeErrorLog` exists so
   * that list never accumulates in stdout.
   */
  async sendMail(request: SendMailRequest): Promise<SendMailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: request.to,
        subject: request.subject,
        text: request.text,
        html: request.html,
      });
      return {
        accepted: (result.accepted?.length ?? 0) > 0,
        messageId: result.messageId,
      };
    } catch (err: unknown) {
      this.logger.error(
        buildSafeErrorLog('mail_send_failed', {
          host: this.config.host,
          port: this.config.port,
          reason: err instanceof Error ? err.name : 'unknown',
        }),
      );
      return { accepted: false, messageId: undefined };
    }
  }
}
