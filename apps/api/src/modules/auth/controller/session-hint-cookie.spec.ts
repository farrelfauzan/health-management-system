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
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
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
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
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
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
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
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
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
      offboardingDeadline: null,
      isProfileIncomplete: false,
      // The longest name the schemas accept (P20-T08), every character a
      // three-byte UTF-8 sequence, so the budget holds in the worst case.
      displayName: 'ꦱ'.repeat(120),
      clinicianProfession: null,
      expiresAt,
    });

    const cookieBytes = 'hms_session_hint='.length + captured[0]!.value.length;
    expect(cookieBytes).toBeLessThan(4096);
  });

  it('carries the offboarding deadline as a calendar date, and omits it for everyone else', () => {
    // P16-T41. The web tier reads `offboardedUntil` to pin navigation to the
    // vault and show the deletion date; a hint written before the field
    // existed has none, and the right reading of that is "not offboarded".
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['DOCTOR'],
      permissions: ['portal.doctor-access:any', 'vault-document.read:own'],
      disabledFeatures: [],
      offboardingDeadline: new Date('2026-10-04T00:00:00.000Z'),
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });
    setSessionHintCookie(response, {
      roles: ['DOCTOR'],
      permissions: ['portal.doctor-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).offboardedUntil).toBe('2026-10-04');
    expect(decodePayload(captured[1]!.value)).not.toHaveProperty('offboardedUntil');
  });

  it('flags an incomplete doctor profile, and writes nothing at all otherwise', () => {
    // P20-T02. `proxy.ts` pins a flagged doctor to the completion screen. A
    // complete doctor's hint must carry no field, so a hint from before this
    // existed and a complete one read the same way: "complete".
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['DOCTOR'],
      permissions: ['portal.doctor-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: true,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });
    setSessionHintCookie(response, {
      roles: ['DOCTOR'],
      permissions: ['portal.doctor-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).profileIncomplete).toBe(true);
    expect(decodePayload(captured[1]!.value)).not.toHaveProperty('profileIncomplete');
  });

  it("carries the holder's name, and omits it for an account no record names", () => {
    // The shell greets people by their name; without this field it shows
    // their email address verbatim (P20-T08), which is also what a hint
    // written before the field existed must keep doing.
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['DOCTOR'],
      permissions: ['portal.doctor-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: 'dr. Siti Nurhaliza, Sp.OG',
      clinicianProfession: 'DOCTOR',
      expiresAt,
    });
    setSessionHintCookie(response, {
      roles: ['ADMIN'],
      permissions: ['portal.admin-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).name).toBe('dr. Siti Nurhaliza, Sp.OG');
    expect(decodePayload(captured[1]!.value)).not.toHaveProperty('name');
  });
  it('labels a clinician by their profession, not by the role they were invited into', () => {
    // The two drift apart on purpose: correcting a profession on the profile
    // is not a role grant, so a doctor whose account still holds MIDWIFE must
    // still read as a doctor in the shell.
    const { response, captured } = buildResponse();

    setSessionHintCookie(response, {
      roles: ['MIDWIFE'],
      permissions: ['portal.doctor-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: 'Olivia Kirana',
      clinicianProfession: 'DOCTOR',
      expiresAt,
    });
    setSessionHintCookie(response, {
      roles: ['ADMIN'],
      permissions: ['portal.admin-access:any'],
      disabledFeatures: [],
      offboardingDeadline: null,
      isProfileIncomplete: false,
      displayName: null,
      clinicianProfession: null,
      expiresAt,
    });

    expect(decodePayload(captured[0]!.value).profession).toBe('DOCTOR');
    expect(decodePayload(captured[1]!.value)).not.toHaveProperty('profession');
  });
});
