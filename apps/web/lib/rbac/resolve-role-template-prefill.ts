/** The fields "Mulai dari" fills on the create-role form (P22-T05). */
type RoleFormPrefill = {
  code: string;
  name: string;
  description: string;
};

/**
 * The form values after the template changes. A field still holding what the
 * previous template put there follows the new one (or clears, for "Kosong");
 * a field the admin has typed into is theirs and stays. Without this the
 * select only ever filled empty fields, so the second pick changed nothing.
 */
export function resolveRoleTemplatePrefill(params: {
  current: RoleFormPrefill;
  previousPrefill: RoleFormPrefill;
  nextPrefill: RoleFormPrefill;
}): RoleFormPrefill {
  const { current, previousPrefill, nextPrefill } = params;
  const follow = (field: keyof RoleFormPrefill): string =>
    current[field].trim() === previousPrefill[field].trim() ? nextPrefill[field] : current[field];
  return { code: follow('code'), name: follow('name'), description: follow('description') };
}
