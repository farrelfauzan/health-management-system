import { Injectable, Logger } from '@nestjs/common';

import { MailService } from './mail.service';
import { MailAttachment, SendMailRequest, SendMailResult } from './mail.types';

/**
 * Name, type and size — never the bytes. The log transport prints the text
 * body because a developer needs the invitation link in it; it prints
 * *nothing* of an attachment because the attachment is a patient's invoice
 * or clinical file, and a local log full of those is its own disclosure.
 */
function describeAttachment(attachment: MailAttachment): string {
  return `  attachment: ${attachment.fileName} (${attachment.mimeType}, ${attachment.content.byteLength} bytes)`;
}

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
 *
 * Attachments (`P16-T23`) are logged as metadata only — see
 * {@link describeAttachment}.
 */
@Injectable()
export class LogMailService extends MailService {
  private readonly logger = new Logger(LogMailService.name);

  async sendMail(request: SendMailRequest): Promise<SendMailResult> {
    const attachmentLines = (request.attachments ?? []).map(describeAttachment);
    this.logger.log(
      [
        `[mail:log-transport] to=${request.to} subject=${request.subject}`,
        request.text,
        ...attachmentLines,
      ].join('\n'),
    );
    return { accepted: true, messageId: undefined };
  }
}
