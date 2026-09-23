export type PermissionRule = {
  action: string;
  subject: string;
  /**
   * Further actions on the same subject that satisfy this rule in place of
   * `action` (P22-T03). A route that a narrow task permission and a broad one
   * both open — vital signs taken by triage and by the attending doctor —
   * names both here, so each key works on its own instead of the narrow one
   * silently needing the broad one too.
   */
  alternativeActions?: readonly string[];
};
