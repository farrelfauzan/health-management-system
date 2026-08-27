/**
 * Reverses {@link packPermissionHint}, returning scope-less permission keys
 * (`patient.read`, `appointment.session.update`).
 *
 * Deliberately three `split` calls and no more: `proxy.ts` runs this in the
 * edge runtime, which has no `zlib` and no Node builtins, and every caller
 * reaches it through the synchronous `resolveSessionClaims` that seventeen
 * server components render from. Anything async or Node-only here would force
 * all of them to become async.
 *
 * Malformed segments are skipped rather than thrown on. The input is a cookie,
 * so it is attacker-controlled by definition; a forged or truncated hint must
 * degrade to a smaller permission set, never to a 500.
 */
export function unpackPermissionHint(packed: string): string[] {
  if (packed.length === 0) {
    return [];
  }
  return packed.split(';').flatMap((group) => {
    const separatorIndex = group.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === group.length - 1) {
      return [];
    }
    const resource = group.slice(0, separatorIndex);
    return group
      .slice(separatorIndex + 1)
      .split(',')
      .filter((action) => action.length > 0)
      .map((action) => `${resource}.${action}`);
  });
}
