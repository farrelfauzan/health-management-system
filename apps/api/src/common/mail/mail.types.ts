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

export type SendMailRequest = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
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
