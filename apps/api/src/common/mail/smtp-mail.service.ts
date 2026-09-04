import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { buildSafeErrorLog } from '../observability/safe-logging';
import { resolveMailConfig } from './mail.config';
import { MailService } from './mail.service';
import { MailAttachment, MailConfig, SendMailRequest, SendMailResult } from './mail.types';

type TransportAttachment = {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Buffer;
};

/**
 * Maps the transport-neutral attachment onto nodemailer's shape. A `Buffer`
 * view over the same bytes rather than a copy: nodemailer accepts a Buffer,
 * and a copy of every invoice PDF per send is memory spent on nothing.
 */
function toTransportAttachment(attachment: MailAttachment): TransportAttachment {
  return {
    filename: attachment.fileName,
    contentType: attachment.mimeType,
    content: Buffer.from(
      attachment.content.buffer,
      attachment.content.byteOffset,
      attachment.content.byteLength,
    ),
  };
}

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
      // The key is added only when there is something to attach, so a
      // request without attachments reaches nodemailer as exactly the payload
      // it did before `P16-T23` — an always-present empty array is a field
      // every provider quirk would have to be re-checked against.
      const attachments = request.attachments ?? [];
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: request.to,
        subject: request.subject,
        text: request.text,
        html: request.html,
        ...(attachments.length > 0 ? { attachments: attachments.map(toTransportAttachment) } : {}),
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
