import type { ClinicDocumentApprovalView } from '@hms/shared-types';

/**
 * Whether the corpus screen should offer to submit this document (`P19`).
 *
 * Two states qualify, and the second one is the bug this replaces. A document
 * with no registry row predates the policy; a document at `DRAFT` is what an
 * upload under an active policy produces, because the upload registers the row
 * itself. The old control checked for the absence of a row and so hid itself
 * on precisely the documents that needed submitting — the assistant could cite
 * none of them and the screen offered no way to change that.
 *
 * The other three states each have their own door: an open round is withdrawn,
 * an issued document goes back for approval through an edit that changes what
 * the assistant may quote, and an archived one is not in use. Offering submit
 * on any of them would be an action the API can only refuse.
 */
export function canSubmitClinicDocument(approval: ClinicDocumentApprovalView): boolean {
  return approval.status === null || approval.status === 'DRAFT';
}
