import type { DocumentTemplateKindValue, DocumentTemplateView } from '@hms/shared-types';

import {
  documentTemplateControllerListTemplatesV1,
  getDocumentTemplateControllerListTemplatesV1QueryKey,
} from '#lib/api/generated/document-templates/document-templates';
import { useApiQuery } from '#lib/api/use-api-query';

export function useDocumentTemplates(kind: DocumentTemplateKindValue, isEnabled = true) {
  const query = useApiQuery<DocumentTemplateView[]>({
    queryKey: getDocumentTemplateControllerListTemplatesV1QueryKey({ kind }),
    queryFn: (signal) => documentTemplateControllerListTemplatesV1({ kind }, signal),
    errorMessage: 'Failed to load document templates',
    enabled: isEnabled,
  });

  return {
    ...query,
    templates: query.data ?? [],
  };
}
