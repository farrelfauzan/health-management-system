import { ConfigService } from '@nestjs/config';

import { MailConfig, MailTransportKind } from './mail.types';

const DEFAULT_PORT = 587;
const IMPLICIT_TLS_PORT = 465;
const DEFAULT_FROM = 'Saling Jaga <no-reply@localhost>';
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

function readTrimmed(configService: ConfigService, key: string): string {
  return configService.get<string>(key)?.trim() ?? '';
}

function readPositiveInteger(configService: ConfigService, key: string, fallback: number): number {
  const rawValue = readTrimmed(configService, key);
  if (rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Mail configuration error: ${key} must be a positive integer`);
  }
  return parsed;
}

function readBoolean(configService: ConfigService, key: string, fallback: boolean): boolean {
  const rawValue = readTrimmed(configService, key).toLowerCase();
  if (rawValue === '') {
    return fallback;
  }
  return rawValue === 'true' || rawValue === '1';
}

/**
 * Picks the transport. `MAIL_TRANSPORT` wins when set; otherwise the presence
 * of `MAIL_HOST` decides.
 *
 * Inferring from the host rather than defaulting to `smtp` is what keeps a
 * fresh checkout working: an unconfigured developer gets the log transport and
 * an invitation link on stdout, not a boot-time failure or — worse — a silent
 * connection refused every time someone is invited. A deployment that means to
 * send mail sets `MAIL_HOST`, which is the same act that makes sending
 * possible at all, so the two cannot drift apart.
 */
function readTransport(configService: ConfigService): MailTransportKind {
  const configured = readTrimmed(configService, 'MAIL_TRANSPORT').toLowerCase();
  if (configured === 'smtp' || configured === 'log') {
    return configured;
  }
  return readTrimmed(configService, 'MAIL_HOST') === '' ? 'log' : 'smtp';
}

/**
 * Credentials are optional as a pair, not individually. A half-filled
 * `MAIL_USER` with no password authenticates as nobody and produces a
 * provider-side rejection that reads like a network fault, so it is refused at
 * boot where the cause is still legible.
 */
function readAuth(configService: ConfigService): MailConfig['auth'] {
  const user = readTrimmed(configService, 'MAIL_USER');
  const password = configService.get<string>('MAIL_PASSWORD') ?? '';
  if (user === '' && password === '') {
    return undefined;
  }
  if (user === '' || password === '') {
    throw new Error('Mail configuration error: MAIL_USER and MAIL_PASSWORD must be set together');
  }
  return { user, password };
}

export function resolveMailConfig(configService: ConfigService): MailConfig {
  const transport = readTransport(configService);
  const host = readTrimmed(configService, 'MAIL_HOST');
  if (transport === 'smtp' && host === '') {
    throw new Error('Mail configuration error: MAIL_HOST is required when MAIL_TRANSPORT is smtp');
  }
  const port = readPositiveInteger(configService, 'MAIL_PORT', DEFAULT_PORT);
  return {
    transport,
    host,
    port,
    secure: readBoolean(configService, 'MAIL_SECURE', port === IMPLICIT_TLS_PORT),
    auth: readAuth(configService),
    from: readTrimmed(configService, 'MAIL_FROM') || DEFAULT_FROM,
    connectionTimeoutMs: readPositiveInteger(
      configService,
      'MAIL_CONNECTION_TIMEOUT_MS',
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
  };
}
