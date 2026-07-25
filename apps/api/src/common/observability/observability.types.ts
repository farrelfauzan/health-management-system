import { CurrentUser } from '../auth/current-user.type';

export type ObservedRequest = {
  requestId?: string;
  user?: CurrentUser;
  readonly method: string;
  readonly originalUrl: string;
  header(name: string): string | undefined;
};

export type ObservedResponse = {
  readonly statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): ObservedResponse;
  json(body: unknown): void;
  on(event: 'finish', listener: () => void): void;
};

export type NextHandler = () => void;
