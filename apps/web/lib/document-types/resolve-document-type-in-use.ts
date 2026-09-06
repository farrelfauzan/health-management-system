import { isAxiosError } from 'axios';
import { DOCUMENT_TYPE_IN_USE_ERROR_CODE, documentTypeInUseDetailsSchema } from '@hms/shared-types';

const HTTP_CONFLICT = 409;

type ConflictPayload = {
  error?: { code?: string; details?: unknown };
};

/**
 * Picks the document count out of the API's delete refusal (FR-E5-36), so
 * the dialog can turn "cannot delete" into "deactivate instead" with the
 * number in it. Any other failure returns null and the API message is shown
 * as-is.
 */
export function resolveDocumentTypeInUse(error: unknown): number | null {
  if (!isAxiosError(error) || error.response?.status !== HTTP_CONFLICT) {
    return null;
  }
  const payload = error.response.data as ConflictPayload | undefined;
  if (payload?.error?.code !== DOCUMENT_TYPE_IN_USE_ERROR_CODE) {
    return null;
  }
  const details = documentTypeInUseDetailsSchema.safeParse(payload.error.details);
  return details.success ? details.data.documentCount : null;
}
