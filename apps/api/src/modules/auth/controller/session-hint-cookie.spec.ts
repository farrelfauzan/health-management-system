import { RefreshTokenCookieWriter } from '../auth.types';
import { setSessionHintCookie } from './session-hint-cookie';

type CapturedCookie = { name: string; value: string };

function buildResponse(): { response: RefreshTokenCookieWriter; captured: CapturedCookie[] } {
  const captured: CapturedCookie[] = [];
  const response = {
    cookie: (name: string, value: string) => {
      captured.push({ name, value });
    },
    clearCookie: () => undefined,
  } as unknown as RefreshTokenCookieWriter;
  return { response, captured };
}

function decodePayload(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('setSessionHintCookie', () => {
  const expiresAt = new Date(Date.now() + 900_000);

  it('carries the disabled feature keys so the shell can hide them before it renders', () => {
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['ADMIN'],
      permissions: ['portal.admin-access:any'],
      disabledFeatures: ['ai-chatbot', 'billing'],
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).disabledFeatures).toEqual(['ai-chatbot', 'billing']);
  });

  it('writes an empty list when everything is enabled', () => {
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['ADMIN'],
      permissions: [],
      disabledFeatures: [],
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).disabledFeatures).toEqual([]);
  });

  it('still carries only portal permissions alongside the features', () => {
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['ADMIN'],
      permissions: ['portal.admin-access:any', 'patient.read:any'],
      disabledFeatures: ['billing'],
      expiresAt,
    });

    const payload = decodePayload(captured[0]!.value);
    expect(payload.permissions).toEqual(['portal.admin-access:any']);
    expect(payload.disabledFeatures).toEqual(['billing']);
  });
});
