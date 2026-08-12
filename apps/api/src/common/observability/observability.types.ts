import { CurrentUser } from '../auth/current-user.type';

export type ObservedRequest = {
  requestId?: string;
  user?: CurrentUser;
  readonly method: string;
  readonly originalUrl: string;
  header(name: string): string | undefined;
};

/** Anything carrying a client address — HTTP requests, in practice. */
export type ClientAddressedRequest = {
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
};

/**
 * Who and where a request came from, for services that must audit an event the
 * `@Audited()` interceptor cannot see — a failed login, which has no
 * authenticated actor and no successful response to hang a row off.
 */
export type RequestContext = {
  readonly ipAddress: string | null;
  readonly requestId: string | null;
};

export type ObservedResponse = {
  readonly statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): ObservedResponse;
  json(body: unknown): void;
  on(event: 'finish', listener: () => void): void;
};

export type NextHandler = () => void;
