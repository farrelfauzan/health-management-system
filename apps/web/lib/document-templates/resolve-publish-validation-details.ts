import { isAxiosError } from 'axios';
import {
  DOCUMENT_TEMPLATE_UNKNOWN_TOKENS_ERROR_CODE,
  documentTemplatePublishValidationDetailsSchema,
  type DocumentTemplatePublishValidationDetails,
} from '@hms/shared-types';

type ErrorEnvelope = {
  error?: { code?: unknown; details?: unknown };
};

/**
 * Reads the unknown-token list out of a refused publish (`P16-T12`). Returns
 * `null` for any other failure so the caller falls back to the generic
 * message — a renderer outage and a typo deserve different UI.
 */
export function resolvePublishValidationDetails(
  error: unknown,
): DocumentTemplatePublishValidationDetails | null {
  if (!isAxiosError(error)) {
    return null;
  }
  const payload = error.response?.data as ErrorEnvelope | undefined;
  if (payload?.error?.code !== DOCUMENT_TEMPLATE_UNKNOWN_TOKENS_ERROR_CODE) {
    return null;
  }
  const parsed = documentTemplatePublishValidationDetailsSchema.safeParse(payload.error.details);
  return parsed.success ? parsed.data : null;
}
