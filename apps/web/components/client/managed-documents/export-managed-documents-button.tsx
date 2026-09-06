'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { exportManagedDocuments } from '#lib/managed-documents/export-managed-documents';
import type { ManagedDocumentFilters } from '#lib/managed-documents/managed-document-filters';

type ExportManagedDocumentsButtonProps = {
  filters: ManagedDocumentFilters;
};

/**
 * Exports the *currently filtered* registry as CSV (FR-E5-07) — metadata
 * only, never a body and never a storage key. The API audits it as an
 * explicit export with those filters and the row count (NFR-PRIV-01), which
 * is why the button sends what the table is showing rather than everything.
 */
export function ExportManagedDocumentsButton({ filters }: ExportManagedDocumentsButtonProps) {
  const t = useTranslations('operations.documents.registry.actions');
  const exportMutation = useMutation({
    mutationFn: () => exportManagedDocuments(filters),
    onError: (err: unknown) => toast.error(resolveApiErrorMessage(err, t('exportError'))),
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={exportMutation.isPending}
      onClick={() => exportMutation.mutate()}
    >
      <Icon name="download" size={18} />
      {t('export')}
    </Button>
  );
}
