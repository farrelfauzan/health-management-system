import { unpackPermissionHint } from '@hms/shared-types';

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

  it('keeps the unpacked permission list to portal keys, scope intact', () => {
    // `proxy.ts` matches these exactly, at the edge, where nothing else is
    // available to match against.
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

  it('carries the full permission set in packed form for the CASL ability', () => {
    // This is the half that moved out of the JWT. Without it the web tier has
    // only `portal.*`, which maps to no CASL rule, and every `<Can>` gate in
    // the admin shell falls back to a hardcoded role preset.
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['SUPER_ADMIN'],
      permissions: ['portal.admin-access:any', 'patient.read:any', 'role.create:any'],
      disabledFeatures: [],
      expiresAt,
    });

    const payload = decodePayload(captured[0]!.value);
    const actualKeys = unpackPermissionHint(payload.packedPermissions as string).sort();
    expect(actualKeys).toEqual(['patient.read', 'portal.admin-access', 'role.create']);
  });

  it('keeps the hint cookie under the browser cookie limit as the catalogue grows', () => {
    // Headroom for roughly half again the current catalogue (127 keys over ~40
    // resources), in the shape the catalogue actually has.
    //
    // The shape matters, and is the one real limit of this encoding: the win
    // comes from writing each resource name once, so it scales with actions
    // per resource and not with resources. Two hundred permissions spread over
    // two hundred *distinct* resources would not fit, and no assertion here
    // would catch it. The guard that tracks the real catalogue reads seed.sql
    // directly — see `apps/web/lib/auth/permission-hint-codec.spec.ts`.
    const { response, captured } = buildResponse();
    const actions = ['read', 'create', 'update', 'delete', 'write'];
    const manyPermissions = Array.from({ length: 200 }, (_, index) => {
      const action = actions[index % actions.length];
      return `resource-name-${Math.floor(index / actions.length)}.${action}:any`;
    });

    setSessionHintCookie(response, {
      roles: ['SUPER_ADMIN'],
      permissions: manyPermissions,
      disabledFeatures: [],
      expiresAt,
    });

    const cookieBytes = 'hms_session_hint='.length + captured[0]!.value.length;
    expect(cookieBytes).toBeLessThan(4096);
  });
});
