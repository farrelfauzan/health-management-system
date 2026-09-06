const PATIENT_ROLE_CODE = 'PATIENT';

type UserWithRoles = { roles: Array<{ code: string }> };

/**
 * Drops patient accounts from a user list before it becomes an approver
 * picker (§7.5.4, FR-E5-09).
 *
 * Client-side only, so the picker never offers what the API would refuse —
 * the API checks again on submit, and that check is the one that counts.
 * Shared by the type's default-approver picker and the drafter's per-document
 * one so the two can never disagree about who is staff.
 */
export function filterStaffUsers<TUser extends UserWithRoles>(users: readonly TUser[]): TUser[] {
  return users.filter((user) => !user.roles.some((role) => role.code === PATIENT_ROLE_CODE));
}
