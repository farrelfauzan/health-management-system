/**
 * A second live course was refused by the partial unique index (P25-T14).
 *
 * A typed error rather than a leaked Prisma code, so the service can answer
 * 409 `FAMILY_PLANNING_COURSE_ACTIVE` without knowing what a `P2002` is — and
 * so two tabs racing read the same as a course started an hour ago.
 */
export class FamilyPlanningCourseConflictError extends Error {
  constructor() {
    super('Patient already has a live family planning course');
    this.name = 'FamilyPlanningCourseConflictError';
  }
}
