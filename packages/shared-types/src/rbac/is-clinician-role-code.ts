import { CLINICIAN_ROLE_CODES } from '#rbac/clinician-role-codes';

/** Whether a role code is one of {@link CLINICIAN_ROLE_CODES} (D-034). */
export function isClinicianRoleCode(roleCode: string): boolean {
  return (CLINICIAN_ROLE_CODES as readonly string[]).includes(roleCode);
}
