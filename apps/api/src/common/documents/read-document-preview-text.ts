import {
  ExtractDocumentTextParams,
  MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS,
  TruncateDocumentPreviewTextResult,
} from '@hms/shared-types';

import { extractDocumentText } from './extract-document-text';
import { sanitiseDocumentPreviewText } from './sanitise-document-preview-text';
import { truncateDocumentPreviewText } from './truncate-document-preview-text';

/**
 * A stored document's text exactly as every in-app preview shows it:
 * extracted, stripped of every tag, and capped at
 * `MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS` with an honest `isTruncated`.
 *
 * One sequence for the approval, clinic corpus and personal knowledge base
 * previews, so a fix to any step reaches all three. Callers check the type
 * allowlist before reading the file, because each answers a refusal with its
 * own error code.
 */
export async function readDocumentPreviewText(
  params: ExtractDocumentTextParams,
): Promise<TruncateDocumentPreviewTextResult> {
  const extracted = await extractDocumentText(params);
  return truncateDocumentPreviewText({
    text: sanitiseDocumentPreviewText(extracted.text),
    limit: MANAGED_DOCUMENT_PREVIEW_MAX_CHARACTERS,
  });
}
