'use client';

import { useMutation } from '@tanstack/react-query';
import type { SharedWithMeDocumentView } from '@hms/shared-types';
import { Button, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { sharedWithMeDocumentControllerGetSharedDownloadUrlV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';

type SharedWithMeRowProps = {
  document: SharedWithMeDocumentView;
  onError: (message: string) => void;
};

/**
 * One document somebody handed to this person (FR-E3-14, FR-E3-17).
 *
 * **Download is the only action, and there is nothing else to hide.** No
 * rename, no delete, no re-share — not because those buttons are conditionally
 * suppressed here, but because the routes behind them are owner-scoped and a
 * shared document is not in the set they query. There is no capability to
 * render, so there is none to forget to remove.
 *
 * Nothing about how the owner files their own paperwork travels with the
 * document either — no category, no reference number, no issue date. Those
 * are their private notes to themselves, and a key to one document is not a
 * window into how somebody organises their drawer.
 */
export function SharedWithMeRow({ document, onError }: SharedWithMeRowProps) {
  const t = useTranslations('vault.sharedWithMe');

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = parseApiSuccess<{ url: string }>(
        await sharedWithMeDocumentControllerGetSharedDownloadUrlV1(document.id),
        t('errors.download'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.download'))),
  });

  return (
    <TableRow>
      <TableCell className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{document.title}</p>
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">{document.sharedByEmail}</TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {document.sharedAt.slice(0, 10)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {document.expiresAt === null ? t('noExpiry') : document.expiresAt.slice(0, 10)}
      </TableCell>
      <TableCell className="px-4 text-sm text-slate-600">
        {formatDocumentSize(document.sizeBytes)}
      </TableCell>
      <TableCell className="px-4 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate()}
        >
          {t('download')}
        </Button>
      </TableCell>
    </TableRow>
  );
}
