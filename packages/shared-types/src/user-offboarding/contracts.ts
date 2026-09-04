/**
 * What the super admin sees before confirming (FR-E3-31): how many of the
 * person's documents will survive because they are shared, how many will be
 * deleted, and on which day. `offboardedAt` is non-null when the person is
 * already in their window, so the same preview serves the re-onboard confirm.
 */
export type UserOffboardingPreview = {
  userId: string;
  email: string;
  sharedDocumentCount: number;
  unsharedDocumentCount: number;
  /** The clinic calendar day the window closes, `YYYY-MM-DD`. */
  deletionDate: string;
  offboardedAt: string | null;
};
