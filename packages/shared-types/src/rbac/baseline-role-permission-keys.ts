/**
 * The keys every staff role carries whatever else it is given (P22-T03).
 *
 * They are what "being signed in" needs rather than what a job needs: signing
 * out, editing one's own name, seeing one's own notifications, knowing which
 * features the clinic has switched on, and reporting a bug. A role built in the
 * IAM screen used to start empty, so an account on it could not even sign out
 * cleanly and its shell rendered without the feature list — an administrator
 * had to know to tick six keys no screen asked for. The API now attaches them
 * on create and keeps them on every permission update, so ticking a job's
 * permissions is enough.
 */
export const BASELINE_ROLE_PERMISSION_KEYS = [
  'auth.logout:own',
  'user.update:own',
  'notification.read:own',
  'notification.manage:own',
  'feature.read-availability:own',
  'bug-report.create:own',
] as const;
