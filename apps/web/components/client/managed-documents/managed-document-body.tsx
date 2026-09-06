'use client';

import { useMutation } from '@tanstack/react-query';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { openManagedDocument } from '#lib/managed-documents/open-managed-document';

type ManagedDocumentBodyProps = {
  document: ManagedDocumentDetailView;
};

/**
 * What the document actually says.
 *
 * A drafted body is rendered from HTML the **API** sanitised on every write
 * (NFR-SEC-01) — the allowlist lives server-side, so the client is not the
 * thing standing between a pasted `<script>` and the reader. An uploaded body
 * is a signed, attachment-disposition download and is never framed in this
 * origin (NFR-SEC-04).
 */
export function ManagedDocumentBody({ document }: ManagedDocumentBodyProps) {
  const t = useTranslations('operations.documents.workspace');
  const registry = useTranslations('operations.documents.registry');
  const downloadMutation = useMutation({
    mutationFn: () =>
      openManagedDocument({
        documentId: document.id,
        errorMessage: registry('actions.downloadError'),
      }),
    onError: (err: unknown) =>
      toast.error(resolveApiErrorMessage(err, registry('actions.downloadError'))),
  });

  if (document.storageKey !== null) {
    return (
      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-slate-600">{t('uploadedBody')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate()}
          >
            <Icon name="download" size={18} />
            {registry('actions.download')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="p-6">
        {document.contentHtml === null || document.contentHtml.trim() === '' ? (
          <p className="text-sm text-slate-500">{t('emptyBody')}</p>
        ) : (
          <div
            className="prose prose-sm max-w-none text-slate-900"
            // Sanitised server-side on every write with the same allowlist the
            // template editor uses; the API is the boundary, not this line.
            dangerouslySetInnerHTML={{ __html: document.contentHtml }}
          />
        )}
      </CardContent>
    </Card>
  );
}
