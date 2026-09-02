import type { DocumentTemplateKindValue, TemplateVariable } from '@hms/shared-types';

import {
  documentTemplateVariableControllerListTemplateVariablesV1,
  getDocumentTemplateVariableControllerListTemplateVariablesV1QueryKey,
} from '#lib/api/generated/document-templates/document-templates';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The variable registry a template of this kind is authored against. It is a
 * code constant on the API, so it is fetched once and never considered
 * stale: the editor rebuilds its extensions when the list changes, and a
 * refetch on window focus must not cost the author their undo history.
 */
export function useTemplateVariables(kind: DocumentTemplateKindValue) {
  const query = useApiQuery<TemplateVariable[]>({
    queryKey: getDocumentTemplateVariableControllerListTemplateVariablesV1QueryKey({ kind }),
    queryFn: (signal) =>
      documentTemplateVariableControllerListTemplateVariablesV1({ kind }, signal),
    errorMessage: 'Failed to load template variables',
    options: {
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    },
  });

  return {
    ...query,
    variables: query.data ?? [],
  };
}
