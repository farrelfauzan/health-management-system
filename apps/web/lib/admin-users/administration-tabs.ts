/** The administration strip's `?tab=` slugs, in strip order (SJ-162). */
export const ADMINISTRATION_TABS = ['users', 'invitations', 'roles', 'clinic'] as const;

export type AdministrationTab = (typeof ADMINISTRATION_TABS)[number];
