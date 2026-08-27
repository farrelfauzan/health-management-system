/**
 * Packs a permission set into the compact form carried by the session-hint
 * cookie.
 *
 * Why this exists: a SUPER_ADMIN holds the whole catalogue, and as a raw JSON
 * array that set is ~2.9 KB. Base64-encoded into a cookie alongside the roles
 * and the disabled feature keys it lands at ~4 KB, and a cookie whose name and
 * value exceed 4096 bytes is silently dropped by the browser — no error, no
 * warning, just a session that renders from a fallback preset forever. This
 * encoding takes the same set to ~1.2 KB.
 *
 * Two reductions, both lossless *for the web tier's purposes*:
 *
 * 1. The `:any` / `:own` scope suffix is dropped, and the result de-duplicated.
 *    `resolveAppAbilityRules` already discards the scope when it maps a key to
 *    a CASL rule — a grant decides whether a button renders, and the API
 *    decides whose rows come back — so nothing downstream can observe the
 *    difference. `portal.*` keys are the exception and are carried separately,
 *    with their scope intact, because `proxy.ts` matches them exactly.
 * 2. Keys are grouped by resource, so the resource name is written once
 *    instead of once per action: `patient:read,create,update`.
 *
 * The wire format is `resource:action,action;resource:action`. None of `;`,
 * `:` or `,` occur inside a resource or an action name, so decoding is three
 * `split` calls — which matters, because `proxy.ts` decodes this in the edge
 * runtime where `zlib` does not exist.
 *
 * This is a rendering hint, never an authorisation input. `PermissionsGuard`
 * re-reads permissions from the database on every request.
 */
export function packPermissionHint(permissionKeys: readonly string[]): string {
  const actionsByResource = new Map<string, Set<string>>();
  for (const permissionKey of permissionKeys) {
    const scopeless = permissionKey.replace(/:(any|own)$/, '');
    const separatorIndex = scopeless.lastIndexOf('.');
    if (separatorIndex <= 0 || separatorIndex === scopeless.length - 1) {
      continue;
    }
    const resource = scopeless.slice(0, separatorIndex);
    const action = scopeless.slice(separatorIndex + 1);
    const actions = actionsByResource.get(resource) ?? new Set<string>();
    actions.add(action);
    actionsByResource.set(resource, actions);
  }
  return [...actionsByResource.entries()]
    .map(([resource, actions]) => `${resource}:${[...actions].sort().join(',')}`)
    .sort()
    .join(';');
}
