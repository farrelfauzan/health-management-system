/**
 * Which transport {@link MailModule} wires up. `log` writes the message to the
 * application log instead of sending it, so a developer with no SMTP account
 * can still walk an invitation link end to end; `smtp` is the real one.
 */
export type MailTransportKind = 'smtp' | 'log';

export type MailAuthConfig = {
  readonly user: string;
  readonly password: string;
};

export type MailConfig = {
  readonly transport: MailTransportKind;
  readonly host: string;
  readonly port: number;
  /**
   * Implicit TLS on connect (SMTPS, conventionally port 465). Left false, the
   * transport still upgrades with STARTTLS where the server offers it — which
   * is what every provider on port 587 expects.
   */
  readonly secure: boolean;
  readonly auth: MailAuthConfig | undefined;
  readonly from: string;
  readonly connectionTimeoutMs: number;
};

/**
 * One file carried with a message (`P16-T23`, FR-E4-05).
 *
 * Bytes rather than a path or URL: the attachment is a rendered document the
 * API already holds — and for E4 delivery, one it has just password-protected
 * — so handing the transport a location to fetch would put a second copy of
 * the file, or a URL to it, somewhere the API does not control.
 */
export type MailAttachment = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
};

export type SendMailRequest = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /**
   * Optional, and omitted by every caller that shipped before `P16-T23`.
   * Absent or empty, the transports build exactly the payload they always
   * did; no size ceiling is imposed here — the delivery worker that queues an
   * attachment owns that policy.
   */
  readonly attachments?: readonly MailAttachment[];
};

export type SendMailResult = {
  readonly accepted: boolean;
  readonly messageId: string | undefined;
};

export type RenderedMail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};
